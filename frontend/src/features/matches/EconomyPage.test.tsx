// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LangProvider } from "@/shared/i18n";
import type { MatchEconomy } from "@/shared/api";
import { AdvantageBars, OutcomeByBuy, RoundBreakdown } from "./EconomyPage";
import type { ReactNode } from "react";

const data: MatchEconomy = {
  demo: "match.dem", map: "de_mirage", teams: ["Alpha", "Bravo"],
  buy_types: ["pistol", "eco", "semi_eco", "semi_buy", "full"],
  rounds: [
    { round_num: 1, winner_side: "ct", end_reason: null, winner_team: "Alpha", teams: {
      Alpha: { side: "ct", equip: 6000, buy_type: "eco", won: true },
      Bravo: { side: "t", equip: 8000, buy_type: "semi_eco", won: false },
    } },
    { round_num: 2, winner_side: "t", end_reason: null, winner_team: "Bravo", teams: {
      Alpha: { side: "ct", equip: 20000, buy_type: "semi_buy", won: false },
      Bravo: { side: "t", equip: 10000, buy_type: "semi_eco", won: true },
    } },
    { round_num: 3, winner_side: "ct", end_reason: null, winner_team: "Alpha", teams: {
      Alpha: { side: "ct", equip: 10000, buy_type: "semi_eco", won: true },
      Bravo: { side: "t", equip: 10000, buy_type: "semi_eco", won: false },
    } },
  ],
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 700, height: 240, top: 0, left: 0, right: 700, bottom: 240, x: 0, y: 0, toJSON() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function show(children: ReactNode) {
  return render(<LangProvider><MemoryRouter><Routes>
    <Route path="/" element={children} />
    <Route path="/matches/:demo/rounds/:round" element={<p>Opened replay</p>} />
  </Routes></MemoryRouter></LangProvider>);
}

it("shows advantage details on keyboard focus, handles equal values, and opens the selected replay", () => {
  show(<AdvantageBars data={data} demo="match.dem" />);
  const third = screen.getByRole("link", { name: "เปิดรอบ 3" });
  fireEvent.focus(third);
  expect(screen.getByRole("tooltip").textContent).toContain("มูลค่าอุปกรณ์เท่ากัน");
  fireEvent.focus(screen.getByRole("link", { name: "เปิดรอบ 2" }));
  expect(screen.getByRole("tooltip").textContent).toContain("Alpha มากกว่า $10,000");
  fireEvent.keyDown(screen.getByRole("link", { name: "เปิดรอบ 2" }), { key: "Enter" });
  expect(screen.getByText("Opened replay")).toBeTruthy();
});

it("shows missing equipment without inventing an advantage", () => {
  const missing: MatchEconomy = { ...data, rounds: [{ ...data.rounds[0], teams: {
    ...data.rounds[0].teams, Bravo: { ...data.rounds[0].teams.Bravo, equip: null },
  } }] };
  show(<AdvantageBars data={missing} demo="match.dem" />);
  fireEvent.focus(screen.getByRole("link", { name: "เปิดรอบ 1" }));
  expect(screen.getByRole("tooltip").textContent).toContain("—");
  expect(screen.getByRole("tooltip").textContent).not.toContain("มากกว่า");
});

it("expands buy outcomes into matching round evidence and handles empty categories", () => {
  show(<OutcomeByBuy data={data} demo="match.dem" side="all" onSideChange={() => {}} />);
  const alpha = screen.getByRole("heading", { name: "Alpha" }).parentElement!;
  const eco = within(alpha).getByRole("button", { name: /^Alpha · Eco ·/ });
  fireEvent.focus(eco);
  expect(screen.getByRole("tooltip").textContent).toContain("ชนะ 1 · แพ้ 0");
  fireEvent.click(eco);
  expect(within(alpha).getByRole("link", { name: "R1 · ชนะ" }).getAttribute("href")).toBe("/matches/match.dem/rounds/1");
  fireEvent.click(within(alpha).getByRole("button", { name: /^Alpha · Full buy ·/ }));
  expect(within(alpha).queryByRole("link")).toBeNull();
});

it("filters the round breakdown by buy share and shows detailed interactive rows", () => {
  show(<RoundBreakdown data={data} demo="match.dem" />);
  expect(screen.getAllByRole("link")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Alpha · Eco · 33%" }));
  expect(screen.getAllByRole("link")).toHaveLength(1);
  const round = screen.getByRole("link", { name: "เปิดรอบ 1" });
  fireEvent.focus(round);
  expect(screen.getByRole("tooltip").textContent).toContain("Bravo มากกว่า $2,000");
  fireEvent.click(screen.getByRole("button", { name: "แสดงทุกรอบ" }));
  expect(screen.getAllByRole("link")).toHaveLength(3);
});
