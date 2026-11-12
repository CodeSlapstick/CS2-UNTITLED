// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { api, type DeathsOverlay, type Match, type ScoreRow } from "@/shared/api";
import { LangProvider } from "@/shared/i18n";
import { AnalysisPage } from "./AnalysisPage";

vi.mock("@/features/opening/OpeningRoutePage", () => ({
  OpeningRoutePage: () => <div data-testid="opening-route">Opening route</div>,
}));

let client: QueryClient;

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });

function match(id: number, map: string, changes: Partial<Match> = {}): Match {
  return {
    id, map_name: map, demo_file: `${map}.dem`, team_a: "A", team_b: "B", tickrate: 64,
    imported_at: "2026-01-01", rounds: 2, ct_rounds: 1, t_rounds: 1, kills: 4,
    status: "done", source: "upload", error_message: null, started_at: null, finished_at: null,
    ...changes,
  };
}

function player(id: string): ScoreRow {
  return { steam_id: id, name: `Player ${id}`, start_side: "t", rounds: 2, kills: 2,
    deaths: 1, assists: 0, headshots: 1, hs_rate: 50, adr: 80, kast: 80, rating: 1 };
}

function Location() { return <output data-testid="location">{useLocation().search}</output>; }

function setup() {
  const matches = [match(1, "de_dust2"), match(2, "de_mirage"),
    match(3, "de_ancient", { source: "reference" }), match(4, "de_nuke", { status: "queued" })];
  const deaths = vi.spyOn(api, "analysisDeaths").mockImplementation(async (map, scope, side, demo, rounds, players) => ({
    map, scope, side: side as DeathsOverlay["side"], demo: demo ?? null, rounds: rounds ?? null, players: players ?? null,
    grid_n: 32, matches: 1, deaths: 4, label: "Test match",
    radar: { map, image: "/radar.png", size: 1024 },
    cells: [{ cx: 1, cy: 1, x: 32, y: 32, w: 32, deaths: 4, share: 1, place: "Middle" }],
  } satisfies DeathsOverlay));
  vi.spyOn(api, "match").mockResolvedValue({ match: matches[0], rounds: [], scoreboard: [player("1"), player("2")] });
  vi.spyOn(api, "playerBehavior").mockResolvedValue({ available: false, reason: "no_model" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["matches"], matches);
  render(<QueryClientProvider client={client}><LangProvider>
    <MemoryRouter initialEntries={["/analysis?unused=keep&player=old&map=old&side=t&scope=upload"]}>
      <AnalysisPage /><Location />
    </MemoryRouter>
  </LangProvider></QueryClientProvider>);
  return deaths;
}

it("keeps completed uploads selectable and resets round/player filters on map changes", async () => {
  const deaths = setup();
  await screen.findByTestId("analysis-radar");
  const maps = screen.getByRole("combobox", { name: "แมพ" });
  expect(within(maps).getAllByRole("option").map((option) => option.textContent)).toEqual(["de_dust2", "de_mirage"]);
  fireEvent.click(within(screen.getByRole("group", { name: "เลือกรอบ" })).getByRole("button", { name: "2" }));
  fireEvent.click(await screen.findByRole("button", { name: "Player 1" }));
  await waitFor(() => expect(deaths).toHaveBeenLastCalledWith("de_dust2", "upload", "all", "de_dust2.dem", [1], ["2"]));
  fireEvent.change(maps, { target: { value: "de_mirage" } });
  await waitFor(() => expect(deaths).toHaveBeenLastCalledWith("de_mirage", "upload", "all", "de_mirage.dem", null, null));
});

it("keeps controls available when no rounds are selected and lets users restore all", async () => {
  const deaths = setup();
  await screen.findByTestId("analysis-radar");
  const calls = deaths.mock.calls.length;
  fireEvent.click(screen.getAllByRole("button", { name: "ไม่เอาเลย" })[0]);
  expect(await screen.findByTestId("analysis-nothing-picked")).toBeTruthy();
  expect(screen.getByRole("group", { name: "เลือกรอบ" })).toBeTruthy();
  expect(deaths.mock.calls).toHaveLength(calls);
  fireEvent.click(screen.getAllByRole("button", { name: "ทั้งหมด" })[0]);
  expect(await screen.findByTestId("analysis-radar")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ตอนเป็น CT" }));
  await waitFor(() => expect(deaths).toHaveBeenLastCalledWith("de_dust2", "upload", "ct", "de_dust2.dem", null, null));
});

it("preserves unrelated URL parameters when switching analysis tools", async () => {
  setup();
  await screen.findByTestId("analysis-radar");
  fireEvent.click(screen.getByRole("tab", { name: "Opening Route" }));
  expect(await screen.findByTestId("opening-route")).toBeTruthy();
  expect(screen.getByTestId("location").textContent).toContain("tool=opening-route");
  fireEvent.click(screen.getByRole("tab", { name: "ทีมเราตายตรงไหน" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("?unused=keep"));
});
