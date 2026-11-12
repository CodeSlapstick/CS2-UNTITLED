// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api, playerApi, type RoundDetail, type RoundPositions } from "@/shared/api";
import { LangProvider } from "@/shared/i18n";
import type { ViewState } from "@/shared/ui/utils";
import { RoundView } from "./RoundView";

let client: QueryClient;
let now = 0;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const onView = vi.fn();

beforeEach(() => {
  localStorage.clear();
  frames.clear();
  now = 0;
  onView.mockClear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(playerApi, "summary").mockRejectedValue(new Error("No aggregate statistics in fixture"));
  vi.spyOn(api, "match").mockRejectedValue(new Error("No scoreboard in fixture"));
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function detail(round: number): RoundDetail {
  return {
    match: { id: 1, demo_file: "match.dem", map_name: "de_dust2", tickrate: 64, team_a: "A", team_b: "B" },
    round: { num: round, start_tick: 1000, winner_side: "t", end_reason: null,
      bomb_planted_t: null, bomb: null, duration: 10, latest_event_t: 0 },
    radar: { image: "/radar.png", size: 1024, map: "de_dust2" }, grid: null, deaths: [], grenades: [],
    teams: [{ clan: "A", side_this_round: "t", players: [{ name: "Player One", steamid: "1",
      color: "#fff", slot: 1, side: "t", survived: true, died_at_t: null,
      killed_by: null, weapon: null, death_order: null, kills: 0 }] }],
    summary: { first_death: null, first_death_side_lost: null, disadvantaged_deaths: { ct: 0, t: 0 },
      duel_deaths: 0, deaths_with_context: 0 },
  };
}

function Harness({ round = 1 }: { round?: number }) {
  const [view, setView] = useState<ViewState>({ nades: [], zoom: 2, center: [100, 100],
    playback: true, time: 2, player: null, death: null });
  return <RoundView demo="match.dem" roundNum={round} view={view} setView={(patch) => {
    onView(patch);
    setView((current) => ({ ...current, ...patch }));
  }} />;
}

function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const positions: RoundPositions = { step: 1, t_end: 10, frames: [], note: "Recorded positions" };
  for (const round of [1, 2]) {
    client.setQueryData(["review-round", "match.dem", round], detail(round));
    client.setQueryData(["review-positions", "match.dem", round], positions);
  }
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}><LangProvider><MemoryRouter>{children}</MemoryRouter></LangProvider></QueryClientProvider>;
  }
  return render(<Harness />, { wrapper: Wrapper });
}

function advance(milliseconds: number) {
  now += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach((callback) => callback(now)));
}

function time() { return Number((screen.getByRole("slider", { name: "เลื่อนเวลาในรอบ" }) as HTMLInputElement).value); }

it("advances at the selected speed, pauses on seek, and stops at the round end", () => {
  setup();
  expect(time()).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "เล่น" }));
  advance(1000);
  expect(time()).toBe(3);
  fireEvent.click(screen.getByRole("button", { name: "2×" }));
  advance(1000);
  expect(time()).toBe(5);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "9" } });
  expect(screen.getByRole("button", { name: "เล่น" })).toBeTruthy();
  advance(1000);
  expect(time()).toBe(9);
  fireEvent.click(screen.getByRole("button", { name: "เล่น" }));
  advance(1000);
  expect(time()).toBe(10);
  expect(screen.getByRole("button", { name: "เล่น" })).toBeTruthy();
  expect(frames.size).toBe(0);
});

it("resets time, playback and map view when switching rounds", () => {
  const view = setup();
  fireEvent.click(screen.getByRole("button", { name: "เล่น" }));
  advance(1000);
  view.rerender(<Harness round={2} />);
  expect(time()).toBe(0);
  expect(screen.getByRole("button", { name: "เล่น" })).toBeTruthy();
  expect(onView).toHaveBeenCalledWith({ zoom: 1, center: null });
  expect(frames.size).toBe(0);
});

it("pauses while player details are open and resumes only if it was playing", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "เล่น" }));
  advance(1000);
  fireEvent.click(screen.getByRole("button", { name: /Player One/ }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  advance(1000);
  expect(time()).toBe(3);
  fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดผู้เล่น" }));
  advance(1000);
  expect(time()).toBe(4);
  fireEvent.click(screen.getByRole("button", { name: "หยุด" }));
  fireEvent.click(screen.getByRole("button", { name: /Player One/ }));
  fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดผู้เล่น" }));
  expect(screen.getByRole("button", { name: "เล่น" })).toBeTruthy();
});

it("handles keyboard seeking and ignores shortcuts from inputs", () => {
  const view = setup();
  fireEvent.keyDown(window, { code: "Space" });
  advance(1000);
  expect(time()).toBe(3);
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(time()).toBe(2);
  expect(screen.getByRole("button", { name: "เล่น" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("slider"), { code: "Space" });
  expect(screen.getByRole("button", { name: "เล่น" })).toBeTruthy();
  fireEvent.keyDown(window, { code: "Space" });
  expect(frames.size).toBe(1);
  view.unmount();
  expect(frames.size).toBe(0);
});

it("keeps map zoom controls working alongside replay", () => {
  setup();
  const radar = screen.getByTestId("radar-svg");
  const width = () => Number(radar.getAttribute("viewBox")!.split(" ")[2]);
  const initial = width();
  fireEvent.click(screen.getByRole("button", { name: "ซูมเข้า" }));
  expect(width()).toBeLessThan(initial);
  fireEvent.click(screen.getByRole("button", { name: "เต็มแมพ" }));
  expect(width()).toBe(1024);
});

it("moves held utility beside armor, restores knife switching, and keeps health readable as a meter", async () => {
  setup();
  const positions = (weapon: string): RoundPositions => ({ step: 1, t_end: 10, note: "Recorded positions",
    frames: [{ t: 0, players: [{ steamid: "1", px: [500, 500], hp: 29, side: "t", place: null,
      active_weapon: weapon, armor: 100 }] }] });
  await act(async () => { client.setQueryData(["review-positions", "match.dem", 1], positions("Smoke Grenade")); });
  const row = screen.getByTestId("roster-row");
  await vi.waitFor(() => expect(screen.getByRole("meter", { name: "Player One HP" }).getAttribute("aria-valuenow")).toBe("29"));
  expect(row.querySelector(".roster-weapon-slot svg")).toBeNull();
  expect(row.querySelectorAll(".pgear svg").length).toBe(2);
  expect(document.querySelector(".live-weapon-icon")).toBeNull();
  await act(async () => { client.setQueryData(["review-positions", "match.dem", 1], positions("knife")); });
  await vi.waitFor(() => expect(row.querySelector(".roster-weapon-slot svg")).not.toBeNull());
  await vi.waitFor(() => expect(row.querySelectorAll(".pgear svg").length).toBe(1));
  expect(document.querySelector(".live-weapon-icon")).not.toBeNull();
  await act(async () => { client.setQueryData(["review-positions", "match.dem", 1], positions("AK-47")); });
  await vi.waitFor(() => expect(row.querySelector(".roster-weapon-slot svg")).not.toBeNull());
  expect(document.querySelector(".live-weapon-icon")).not.toBeNull();
});

it("shows the complete recorded inventory after the defuse kit, including duplicate flashes", async () => {
  setup();
  const positions = (inventory: string[]): RoundPositions => ({ step: 1, t_end: 10, note: "Recorded positions",
    frames: [{ t: 0, players: [{ steamid: "1", px: [500, 500], hp: 100, side: "ct", place: null,
      active_weapon: "Karambit", armor: 100, has_defuser: true, utility_inventory: inventory }] }] });
  await act(async () => { client.setQueryData(["review-positions", "match.dem", 1], positions(["Smoke Grenade", "Flashbang", "Flashbang", "HE Grenade"])); });
  await vi.waitFor(() => expect(document.querySelectorAll(".roster-utility").length).toBe(4));
  const gear = document.querySelector(".pgear")!;
  expect(gear.children[2].className).toBe("roster-utility");
  expect(gear.querySelectorAll('span[title="Flashbang"]').length).toBe(2);
  await act(async () => { client.setQueryData(["review-positions", "match.dem", 1], positions([])); });
  await vi.waitFor(() => expect(document.querySelectorAll(".roster-utility").length).toBe(0));
});

it("shows match K/D/A by Steam ID even for a dead player, without inventing missing totals", async () => {
  setup();
  const row = screen.getByTestId("roster-row");
  expect(row.querySelector(".roster-kda")?.textContent).toContain("— / — / —");
  await act(async () => { client.setQueryData(["match", 1], { scoreboard: [
    { steam_id: "other", name: "Player One", kills: 99, deaths: 99, assists: 99 },
    { steam_id: "1", name: "Player One", kills: 12, deaths: 8, assists: 4 },
  ] }); });
  await vi.waitFor(() => expect(row.querySelector(".roster-kda")?.textContent).toContain("12 / 8 / 4"));
  expect(row.getAttribute("data-dead")).toBe("1");
});
