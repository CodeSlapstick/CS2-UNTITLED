# -*- coding: utf-8 -*-
import json
import math
import os
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np

from backend.config.settings import ROOT
from backend.services.features import other_side

RADARS_JSON = ROOT / "assets" / "radars.json"


@dataclass(frozen=True)
class RadarFrame:
    map_name: str
    image: str
    size: int
    pos_x: float
    pos_y: float
    scale: float

    @property
    def span(self) -> float:
        return self.size * self.scale

    @property
    def x_left(self) -> float:
        return self.pos_x

    @property
    def x_right(self) -> float:
        return self.pos_x + self.span

    @property
    def y_top(self) -> float:
        return self.pos_y

    @property
    def y_bottom(self) -> float:
        return self.pos_y - self.span

    @property
    def extent(self) -> tuple[float, float, float, float]:
        return (self.x_left, self.x_right, self.y_bottom, self.y_top)

    def cell_size(self, grid_n: int) -> float:
        return self.span / grid_n


def load_radars() -> dict:
    return json.loads(RADARS_JSON.read_text(encoding="utf-8"))


@lru_cache(maxsize=32)
def site_of(x: float | None, y: float | None, map_name: str) -> str | None:
    if x is None or y is None:
        return None
    sites = (load_radars().get(map_name) or {}).get("sites")
    if not sites:
        return None
    best, best_d = None, None
    for name in ("A", "B"):
        cx, cy = sites[name]
        d = (x - cx) ** 2 + (y - cy) ** 2
        if best_d is None or d < best_d:
            best, best_d = name, d
    return best


def radar_frame(map_name: str) -> RadarFrame | None:
    r = load_radars().get(map_name)
    if not isinstance(r, dict):
        return None
    return RadarFrame(map_name, r["image"], int(r["size"]), float(r["pos_x"]), float(r["pos_y"]), float(r["scale"]))


def cells_of(xs, ys, frame: RadarFrame, grid_n: int) -> tuple[np.ndarray, np.ndarray]:
    cell = frame.cell_size(grid_n)
    cx = np.clip((np.asarray(xs, dtype=float) - frame.x_left) // cell, 0, grid_n - 1).astype(int)
    cy = np.clip((np.asarray(ys, dtype=float) - frame.y_bottom) // cell, 0, grid_n - 1).astype(int)
    return cx, cy


def cell_of(x: float, y: float, frame: RadarFrame, grid_n: int) -> tuple[int, int]:
    cx, cy = cells_of([x], [y], frame, grid_n)
    return int(cx[0]), int(cy[0])


def cell_rect_world(cx: int, cy: int, frame: RadarFrame, grid_n: int) -> tuple[float, float, float, float]:
    cell = frame.cell_size(grid_n)
    x0 = frame.x_left + cx * cell
    y0 = frame.y_bottom + cy * cell
    return x0, y0, x0 + cell, y0 + cell


def world_to_pixel(x: float, y: float, frame: RadarFrame) -> tuple[float, float]:
    return (x - frame.pos_x) / frame.scale, (frame.pos_y - y) / frame.scale


def cell_rect_pixel(cx: int, cy: int, frame: RadarFrame, grid_n: int) -> tuple[float, float, float]:
    x0, _, _, y1 = cell_rect_world(cx, cy, frame, grid_n)
    px, py = world_to_pixel(x0, y1, frame)
    return px, py, frame.cell_size(grid_n) / frame.scale


def in_frame(x: float, y: float, frame: RadarFrame) -> bool:
    return frame.x_left <= x < frame.x_right and frame.y_bottom < y <= frame.y_top


def nearest_within(x: float, y: float, centers: list[tuple[float, float]], radius: float) -> int | None:
    if not centers:
        return None
    c = np.asarray(centers, dtype=float)
    d = np.hypot(c[:, 0] - x, c[:, 1] - y)
    i = int(np.argmin(d))
    return i if d[i] <= radius else None


GRID_JSON = Path(os.environ.get("GRID_ML1_JSON", ROOT / "output" / "grid_ml1.json"))
MODEL_ROOT = Path(os.environ.get("MODEL_ROOT", ROOT / "output" / "models"))

TEAM_PALETTES = (
    ("#22d3ee", "#34d399", "#a3e635", "#60a5fa", "#2dd4bf", "#86efac"),
    ("#f472b6", "#c084fc", "#fb7185", "#facc15", "#fb923c", "#e879f9"),
)
UNKNOWN_COLOUR = "#94a3b8"


@dataclass
class GridModel:
    map_name: str
    grid_n: int
    min_kills: int
    matches: int
    duels: int
    ct_win_overall: float
    bandwidth: float
    clusters: dict[int, dict]
    cells: dict[tuple[int, int], dict]
    hotspots: list[dict] = field(default_factory=list)

    @property
    def source(self) -> dict:
        return {"matches": self.matches, "duels": self.duels, "map": self.map_name,
                "label": f"ทั้งดาต้าเซ็ต {self.matches} แมตช์ ({self.duels:,} การดวลบน {self.map_name})"}


_cache: dict[str, tuple[float, GridModel]] = {}


def parse_grid_model(d: dict) -> GridModel:
    m = d["metrics"]
    return GridModel(
        map_name=d["map"], grid_n=int(d.get("grid_n", 0)), min_kills=int(d.get("min_kills", 0)),
        matches=int(m["matches"]), duels=int(m["duels"]), ct_win_overall=float(m["ct_win_overall"]),
        bandwidth=float(m["bandwidth"]),
        clusters={int(c["id"]): c for c in d.get("clusters", [])},
        cells={(int(c["cx"]), int(c["cy"])): c for c in d.get("cells", [])},
        hotspots=list(d["hotspots"]),
    )


def load_grid_model(path: Path | None = None, *, map_name: str | None = None) -> GridModel | None:
    if path is None:
        configured = os.environ.get("GRID_ML1_JSON")
        candidates = ([Path(configured)] if configured else []) + (
            [MODEL_ROOT / map_name / "grid_ml1.json"] if map_name else []
        ) + [GRID_JSON]
        path = next((candidate for candidate in candidates if candidate.is_file()), candidates[0])
    path = Path(path)
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        return None
    hit = _cache.get(str(path))
    if hit and hit[0] == mtime:
        return hit[1]
    model = parse_grid_model(json.loads(path.read_text(encoding="utf-8")))
    _cache[str(path)] = (mtime, model)
    return model




ANALYSIS_GRID_N = 32


def deaths_overlay(xs, ys, frame: RadarFrame, places=None, grid_n: int = ANALYSIS_GRID_N) -> dict:
    total = len(xs)
    if total == 0:
        return {"grid_n": grid_n, "deaths": 0, "cells": []}
    cx, cy = cells_of(xs, ys, frame, grid_n)
    names = list(places) if places is not None else [None] * total
    counts: dict[tuple[int, int], int] = {}
    by_place: dict[tuple[int, int], dict[str, int]] = {}
    for a, b, place in zip(cx.tolist(), cy.tolist(), names, strict=True):
        counts[(a, b)] = counts.get((a, b), 0) + 1
        if place:
            seen = by_place.setdefault((a, b), {})
            seen[place] = seen.get(place, 0) + 1
    cells = []
    for (a, b), n in sorted(counts.items()):
        x, y, w = cell_rect_pixel(a, b, frame, grid_n)
        seen = by_place.get((a, b))
        place = min(seen, key=lambda p: (-seen[p], p)) if seen else None
        cells.append({"cx": a, "cy": b, "x": x, "y": y, "w": w, "deaths": n, "share": n / total, "place": place})
    return {"grid_n": grid_n, "deaths": total, "cells": cells}


def _hotspot_at(x: float, y: float, model: GridModel) -> dict | None:
    index = nearest_within(x, y, [(h["x"], h["y"]) for h in model.hotspots], model.bandwidth)
    if index is None:
        return None
    hotspot = model.hotspots[index]
    return {"id": hotspot["id"], "place": hotspot["place"], "share": hotspot["share"]}


def death_context(x: float | None, y: float | None, victim_side: str | None, is_duel: bool,
                  model: GridModel | None, frame: RadarFrame | None) -> dict:
    out = {"cell": None, "hotspot": None, "reason": None, "disadvantaged": None, "enemy_win": None}
    if x is None or y is None:
        out["reason"] = "no_position"
        return out
    if model is None or frame is None or model.map_name != frame.map_name:
        out["reason"] = "no_model"
        return out

    if not model.cells:
        out["hotspot"] = _hotspot_at(x, y, model)
        if out["hotspot"] is None:
            out["reason"] = "insufficient"
        return out

    cx, cy = cell_of(x, y, frame, model.grid_n)
    cell = model.cells.get((cx, cy))
    if cell is None:
        out["reason"] = "insufficient"
        out["cell_xy"] = {"cx": cx, "cy": cy}
        return out
    cid = int(cell["cluster"])
    cluster = model.clusters[cid]
    ct_win = float(cluster["ct_win"])
    out["cell"] = {"cx": cx, "cy": cy, "cluster_id": cid, "cluster_name": cluster["name"], "ct_win": ct_win,
                   "cell_ct_win": float(cell["ct_win"]), "cell_duels": int(cell["kills"])}

    out["hotspot"] = _hotspot_at(x, y, model)

    if victim_side in ("ct", "t"):
        enemy = other_side(victim_side)
        out["enemy_win"] = ct_win if enemy == "ct" else 1 - ct_win
        if is_duel:
            out["disadvantaged"] = out["enemy_win"] > 0.5
    return out


def _t(tick, start_tick, tickrate) -> float | None:
    if tick is None or start_tick is None or not tickrate:
        return None
    return round((int(tick) - int(start_tick)) / int(tickrate), 6)


def player_groups(roster: list[dict]) -> list[list[int]]:
    by_team = all((r.get("team") or "").strip() for r in roster)
    key = "team" if by_team else "start_side"
    keys = sorted({(r.get(key) or "").strip() for r in roster}) if by_team else ["ct", "t"]
    groups = [sorted(int(r["steam_id"]) for r in roster if (r.get(key) or "").strip() == k) for k in keys]
    return [g for g in groups if g]


def player_colours(roster: list[dict]) -> dict[int, str]:
    out = {}
    for gi, members in enumerate(player_groups(roster)):
        palette = TEAM_PALETTES[gi] if gi < len(TEAM_PALETTES) else (UNKNOWN_COLOUR,)
        for i, sid in enumerate(members):
            out[sid] = palette[i % len(palette)]
    return out


def player_slots(roster: list[dict]) -> dict[int, int]:
    return {sid: i + 1 for members in player_groups(roster) for i, sid in enumerate(members)}


def build_round_list(rounds: list[dict], first_deaths: dict[int, int], death_counts: dict[int, int],
                     tickrate: int) -> list[dict]:
    return [{
        "round_num": r["round_num"], "winner_side": r["winner_side"], "end_reason": r["end_reason"],
        "deaths_count": death_counts.get(r["round_num"], 0),
        "first_death_t": _t(first_deaths.get(r["round_num"]), r["start_tick"], tickrate),
    } for r in rounds]


NADE_DISPLAY_RADIUS = {"smoke": 144, "molotov": 120}


def _person_factory(roster: list[dict], in_round: list[dict]):
    colours = player_colours(roster)
    slots = player_slots(roster)
    info = {int(r["steam_id"]): r for r in roster}
    side_now = {int(p["steam_id"]): p["side"] for p in in_round}

    def person(sid, name, side) -> dict | None:
        if sid is None:
            return None
        sid = int(sid)
        return {"steamid": str(sid), "name": name or info.get(sid, {}).get("name") or str(sid),
                "side": side or side_now.get(sid), "team": info.get(sid, {}).get("team"),
                "color": colours.get(sid, UNKNOWN_COLOUR), "slot": slots.get(sid)}

    return person, info, side_now, colours, slots


def _death_rows(kills: list[dict], person, *, start, tickrate: int,
                frame: RadarFrame | None, model: GridModel | None) -> list[dict]:
    deaths = []
    for i, k in enumerate(kills, 1):
        victim = person(k["victim_id"], k.get("victim_name"), k.get("victim_side"))
        attacker = person(k.get("attacker_id"), k.get("attacker_name"), k.get("attacker_side"))
        is_duel = bool(attacker) and k.get("attacker_side") in ("ct", "t") and k.get("attacker_side") != k.get("victim_side")
        vx, vy, ax, ay = k.get("victim_x"), k.get("victim_y"), k.get("attacker_x"), k.get("attacker_y")
        vpx = world_to_pixel(vx, vy, frame) if frame and vx is not None and vy is not None else None
        apx = world_to_pixel(ax, ay, frame) if frame and ax is not None and ay is not None else None
        ctx = death_context(vx, vy, k.get("victim_side"), is_duel, model, frame)
        deaths.append({
            "order": i, "tick": int(k["tick"]), "t_round": _t(k["tick"], start, tickrate),
            "victim": victim, "attacker": attacker,
            "assister": k.get("assister_name"),
            "is_duel": is_duel, "team_kill": bool(attacker) and not is_duel and k.get("attacker_side") == k.get("victim_side"),
            "weapon": k.get("weapon"), "headshot": bool(k.get("headshot")),
            "attacker_blind": bool(k.get("attacker_blind")), "thru_smoke": bool(k.get("thru_smoke")),
            "noscope": bool(k.get("noscope")), "penetrated": int(k.get("penetrated") or 0),
            "distance": round(math.hypot(ax - vx, ay - vy)) if None not in (ax, ay, vx, vy) else None,
            "victim_X": vx, "victim_Y": vy, "attacker_X": ax, "attacker_Y": ay,
            "victim_px": vpx, "attacker_px": apx,
            "place": k.get("victim_place"), "attacker_place": k.get("attacker_place"),
            **ctx,
        })
    return deaths


def build_grenade_rows(grenades: list[dict], person, *, start, tickrate: int, frame: RadarFrame | None) -> list[dict]:
    nades = []
    for g in grenades:
        land_t, end_t = _t(g.get("land_tick"), start, tickrate), _t(g.get("end_tick"), start, tickrate)
        if land_t is not None and end_t is not None and end_t < land_t:
            end_t = None
        tx, ty, lx, ly = g.get("throw_x"), g.get("throw_y"), g.get("land_x"), g.get("land_y")
        raw_trajectory = g.get("trajectory")
        if isinstance(raw_trajectory, str):
            try:
                raw_trajectory = json.loads(raw_trajectory)
            except (TypeError, ValueError):
                raw_trajectory = None
        trajectory = []
        if frame and isinstance(raw_trajectory, list):
            for point in raw_trajectory:
                if not isinstance(point, (list, tuple)) or len(point) < 3 or None in point[:3]:
                    continue
                tick, x, y = int(point[0]), float(point[1]), float(point[2])
                px, py = world_to_pixel(x, y, frame)
                trajectory.append({"tick": tick, "t": _t(tick, start, tickrate),
                                   "px": [round(px, 1), round(py, 1)]})
        nades.append({
            "type": g["type"],
            "thrower": person(g.get("thrower_id"), g.get("thrower_name"), g.get("side")),
            "t_throw": _t(g["tick"], start, tickrate), "t_land": land_t, "t_end": end_t,
            "throw_px": world_to_pixel(tx, ty, frame) if frame and None not in (tx, ty) else None,
            "land_px": world_to_pixel(lx, ly, frame) if frame and None not in (lx, ly) else None,
            "trajectory": trajectory,
            "trajectory_source": "demo" if trajectory else ("endpoints" if None not in (tx, ty, lx, ly, land_t) else "none"),
            "r_px": round(NADE_DISPLAY_RADIUS.get(g["type"], 0) / frame.scale, 1) if frame else 0,
            "radius_is_estimate": g["type"] in NADE_DISPLAY_RADIUS,
        })
    return nades


def _team_rows(side_now: dict[int, str], info: dict[int, dict], colours: dict[int, str],
               slots: dict[int, int], deaths: list[dict]) -> list[dict]:
    teams: dict[str, dict] = {}
    for sid in sorted(side_now):
        p = info.get(sid, {"name": str(sid), "team": None})
        team = p.get("team") or ("?")
        t = teams.setdefault(team, {"clan": team, "side_this_round": side_now[sid], "players": []})
        death = next((d for d in deaths if d["victim"] and d["victim"]["steamid"] == str(sid)), None)
        t["players"].append({
            "name": p.get("name") or str(sid), "steamid": str(sid), "color": colours.get(sid, UNKNOWN_COLOUR),
            "slot": slots.get(sid),
            "side": side_now[sid],
            "survived": death is None,
            "died_at_t": death["t_round"] if death else None,
            "killed_by": (death["attacker"]["name"] if death and death["attacker"] else None),
            "weapon": death["weapon"] if death else None,
            "death_order": death["order"] if death else None,
            "kills": sum(1 for d in deaths if d["is_duel"] and d["attacker"] and d["attacker"]["steamid"] == str(sid)),
        })
    return sorted(teams.values(), key=lambda t: (t["side_this_round"] != "ct", t["clan"]))


def _bomb_marker(rnd: dict, frame: RadarFrame | None) -> dict | None:
    if rnd.get("bomb_plant_x") is None or rnd.get("bomb_plant_y") is None:
        return None
    px = world_to_pixel(rnd["bomb_plant_x"], rnd["bomb_plant_y"], frame) if frame else None
    return {"x": rnd["bomb_plant_x"], "y": rnd["bomb_plant_y"], "px": px, "site": rnd.get("bomb_site")}


def _round_summary(deaths: list[dict], winner: str | None) -> dict:
    first = deaths[0] if deaths else None
    disadv = {"ct": 0, "t": 0}
    for d in deaths:
        if d["disadvantaged"] and d["victim"] and d["victim"]["side"] in disadv:
            disadv[d["victim"]["side"]] += 1
    return {
        "first_death": None if not first else {
            "order": 1, "name": first["victim"]["name"], "side": first["victim"]["side"],
            "place": first["place"], "t_round": first["t_round"],
            "by": first["attacker"]["name"] if first["attacker"] else None,
        },
        "first_death_side_lost": (first["victim"]["side"] != winner) if first and winner in ("ct", "t") else None,
        "disadvantaged_deaths": disadv,
        "duel_deaths": sum(d["is_duel"] for d in deaths),
        "deaths_with_context": sum(d["cell"] is not None for d in deaths),
    }


def build_round_detail(*, match: dict, rnd: dict, roster: list[dict], in_round: list[dict], kills: list[dict],
                       frame: RadarFrame | None, model: GridModel | None, grenades: list[dict] = (),
                       latest_damage_tick: int | None = None, damages: list[dict] = ()) -> dict:
    tickrate = int(match["tickrate"] or 128)
    start = rnd["start_tick"]
    winner = rnd.get("winner_side")
    person, info, side_now, colours, slots = _person_factory(roster, in_round)

    deaths = _death_rows(kills, person, start=start, tickrate=tickrate, frame=frame, model=model)
    nades = build_grenade_rows(grenades, person, start=start, tickrate=tickrate, frame=frame)
    shots = [{"id": int(d["id"]), "tick": int(d["tick"]),
              "attacker": str(d["attacker_id"]), "victim": str(d["victim_id"]),
              "damage": int(d["damage"])}
             for d in damages if d.get("attacker_id") and d.get("victim_id")
             and d["attacker_id"] != d["victim_id"] and int(d.get("damage") or 0) > 0]
    raw_defuses = rnd.get("defuse_intervals") or []
    if isinstance(raw_defuses, str):
        raw_defuses = json.loads(raw_defuses)
    defuses = [{"steamid": str(item["steam_id"]), "start_t": _t(item["start_tick"], start, tickrate),
                "end_t": _t(item["end_tick"], start, tickrate),
                "has_kit": bool(item.get("has_kit", False))} for item in raw_defuses]
    event_ticks = [k["tick"] for k in kills]
    event_ticks.extend(t for t in (rnd.get("bomb_plant_tick"), rnd.get("bomb_resolved_tick"), latest_damage_tick) if t is not None)
    event_ticks.extend(item["end_tick"] for item in raw_defuses)
    latest_event_t = _t(max(event_ticks), start, tickrate) if event_ticks else None

    return {
        "match": {k: match.get(k) for k in ("id", "demo_file", "map_name", "tickrate", "team_a", "team_b")},
        "round": {"num": rnd["round_num"], "start_tick": start,
                  "winner_side": winner, "end_reason": rnd.get("end_reason"),
                  "bomb_planted_t": _t(rnd.get("bomb_plant_tick"), start, tickrate),
                  "bomb_resolved_t": _t(rnd.get("bomb_resolved_tick"), start, tickrate),
                  "bomb": _bomb_marker(rnd, frame),
                  "duration": _t(rnd.get("end_tick"), start, tickrate), "latest_event_t": latest_event_t,
                  "defuses": defuses},
        "radar": None if not frame else {"image": "/assets" + frame.image, "size": frame.size, "map": frame.map_name},
        "grid": None if not model or not frame or model.map_name != frame.map_name else {
            "source": model.source, "ct_win_overall": model.ct_win_overall, "min_kills": model.min_kills},
        "teams": _team_rows(side_now, info, colours, slots, deaths),
        "deaths": deaths,
        "damages": shots,
        "grenades": nades,
        "summary": _round_summary(deaths, winner),
    }


def build_round_positions(positions: list[dict], *, start_tick, tickrate: int, frame: RadarFrame | None) -> dict:
    by_tick: dict[int, dict[str, dict]] = {}
    for r in positions:
        tick = int(r["tick"])
        t = _t(tick, start_tick, tickrate)
        if t is None or r.get("x") is None or r.get("y") is None or frame is None:
            continue
        px, py = world_to_pixel(r["x"], r["y"], frame)
        player = {
            "steamid": str(r["steam_id"]),
            "px": [round(px, 1), round(py, 1)],
            "hp": int(r.get("health") or 0),
            "side": r.get("side"),
            "place": r.get("place"),
        }
        if r.get("yaw") is not None:
            player["yaw"] = float(r["yaw"])
        if r.get("flash_remaining") is not None and float(r["flash_remaining"]) > 0:
            player["flash_remaining"] = float(r["flash_remaining"])
        if r.get("active_weapon") is not None:
            player["active_weapon"] = r["active_weapon"]
        if r.get("armor") is not None:
            player["armor"] = int(r["armor"])
        if r.get("has_helmet") is not None:
            player["has_helmet"] = bool(r["has_helmet"])
        if r.get("has_defuser") is not None:
            player["has_defuser"] = bool(r["has_defuser"])
        if r.get("money") is not None:
            player["money"] = int(r["money"])
        if r.get("has_bomb") is not None:
            player["has_bomb"] = bool(r["has_bomb"])
        if r.get("utility_inventory") is not None:
            player["utility_inventory"] = list(r["utility_inventory"])
        by_tick.setdefault(tick, {}).setdefault(player["steamid"], player)
    ticks = sorted(by_tick)
    frames = [
        {"tick": tick, "t": _t(tick, start_tick, tickrate),
         "players": sorted(by_tick[tick].values(), key=lambda p: p["steamid"])}
        for tick in ticks
    ]
    gaps = [(b - a) / tickrate for a, b in zip(ticks, ticks[1:], strict=False)] if tickrate else []
    step = round(sorted(gaps)[len(gaps) // 2], 6) if gaps else 0.125
    sample_hz = round(1 / step, 2) if step > 0 else 8.0
    return {
        "step": step,
        "sample_hz": sample_hz,
        "t_end": frames[-1]["t"] if frames else 0.0,
        "frames": frames,
        "note": ("ตำแหน่งถูกเก็บ 8 ครั้งต่อวินาที · การเคลื่อนที่ระหว่าง snapshot เป็นการ interpolate"
                 if sample_hz >= 7.5 else
                 "ข้อมูลเดิมเก็บตำแหน่งประมาณวินาทีละครั้ง · การเคลื่อนที่ระหว่าง snapshot เป็นการ interpolate"),
    }



HEATMAP_EVENTS = ("kills", "deaths", "positions", "smoke", "flash", "he", "molotov")


def heatmap_points(xs, ys, frame: RadarFrame) -> list[list[float]]:
    out: list[list[float]] = []
    for x, y in zip(xs, ys, strict=True):
        if x is None or y is None or not in_frame(x, y, frame):
            continue
        px, py = world_to_pixel(x, y, frame)
        out.append([round(px, 1), round(py, 1)])
    return out


TEAM_BUY_TYPES = ("pistol", "eco", "semi_eco", "semi_buy", "full")


def build_economy(econ: list[dict], sides: list[dict], roster: list[dict]) -> dict:
    team_of = {int(p["steam_id"]): (p.get("team") or "ไม่ทราบทีม") for p in roster}
    votes: dict[tuple[int, str], Counter] = {}
    for s in sides:
        team = team_of.get(int(s["steam_id"]))
        if team and s.get("side") in ("ct", "t"):
            votes.setdefault((s["round_num"], s["side"]), Counter())[team] += 1

    rounds: list[dict] = []
    order: list[str] = []
    for e in sorted(econ, key=lambda r: r["round_num"]):
        per: dict[str, dict] = {}
        for side in ("ct", "t"):
            v = votes.get((e["round_num"], side))
            if not v:
                continue
            team = v.most_common(1)[0][0]
            if team not in order:
                order.append(team)
            per[team] = {
                "side": side,
                "equip": e.get(f"{side}_equip"),
                "buy_type": e.get(f"{side}_buy_type"),
                "won": e.get("winner_side") == side,
            }
        winner = next((t for t, x in per.items() if x["won"]), None)
        rounds.append({"round_num": e["round_num"], "winner_side": e.get("winner_side"),
                       "end_reason": e.get("end_reason"), "winner_team": winner, "teams": per})
    return {"teams": order[:2], "rounds": rounds, "buy_types": list(TEAM_BUY_TYPES)}
