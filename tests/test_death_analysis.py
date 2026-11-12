"""The Analysis death map uses match counts, independently of offline ML artifacts."""

import asyncio

import httpx

from backend.routes import application
from backend.services.review import radar_frame


def test_death_map_counts_and_filters_do_not_require_grid_model(monkeypatch):
    frame = radar_frame("de_dust2")
    step = frame.cell_size(32)
    x, y = frame.x_left + step / 2, frame.y_bottom + step / 2
    calls = []

    class Connection:
        async def fetchval(self, sql, *args):
            calls.append((sql, args))
            return 1

        async def fetch(self, sql, *args):
            calls.append((sql, args))
            return [
                {"x": x, "y": y, "place": "Mid"},
                {"x": x, "y": y, "place": "Mid"},
                {"x": x + step, "y": y, "place": "Doors"},
            ]

    def no_model(*args, **kwargs):
        raise AssertionError("The Analysis death map must not load an offline grid model")

    monkeypatch.setattr(application, "load_grid_model", no_model)

    async def run():
        previous = application.app.dependency_overrides.copy()
        application.app.dependency_overrides[application.db] = Connection
        application.app.dependency_overrides[application.require_viewer] = lambda: {"type": "steam", "id": 7}
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=application.app),
                base_url="http://test",
            ) as client:
                return await client.get(
                    "/api/analysis/deaths",
                    params={
                        "map": "de_dust2",
                        "scope": "upload",
                        "demo": "match.dem",
                        "side": "ct",
                        "rounds": "1,2",
                        "players": "76561198000000001",
                    },
                )
        finally:
            application.app.dependency_overrides.clear()
            application.app.dependency_overrides.update(previous)

    response = asyncio.run(run())

    assert response.status_code == 200
    data = response.json()
    assert data["deaths"] == 3
    assert data["grid_n"] == 32
    assert sorted(cell["deaths"] for cell in data["cells"]) == [1, 2]
    assert sum(cell["share"] for cell in data["cells"]) == 1
    assert {cell["place"] for cell in data["cells"]} == {"Mid", "Doors"}
    assert calls[-1][1] == ("de_dust2", "upload", "ct", "match.dem", [1, 2], [76561198000000001])
