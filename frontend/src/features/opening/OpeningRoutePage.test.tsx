// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LangProvider } from "@/shared/i18n";
import type { OpeningRoutes } from "@/shared/api";
import { OpeningRouteStage } from "./OpeningRoutePage";

afterEach(cleanup);

it("keeps death crosses when seeking, hides removed layers, and preserves round visibility controls", () => {
  const data: OpeningRoutes = { radar: { image: "/radar.png", size: 1024, map: "de_mirage" },
    matches: 1, undated_matches: 0, window_seconds: 30, clock_source: "fixture",
    rounds: [{ key: "1:1", demo_file: "match.dem", match_name: "Alpha vs Bravo", match_date: null,
      round_num: 1, side: "t", clock_available: true, max_gap: 1.5,
      segments: [[{ t: 0, px: [100, 100] }, { t: 1, px: [200, 100] }]],
      death_t: 1.25, death_px: [250, 120], utility: [] }] };
  render(<LangProvider><MemoryRouter><OpeningRouteStage data={data} playerName="Player" map="de_mirage" side="t" /></MemoryRouter></LangProvider>);
  expect(screen.getAllByTestId("opening-live-marker")).toHaveLength(1);
  expect(screen.queryByText("Utility")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  const timeline = screen.getByRole("slider", { name: "เวลา Playback" });
  fireEvent.change(timeline, { target: { value: "2" } });
  expect(screen.queryByTestId("opening-live-marker")).toBeNull();
  expect(screen.getByTestId("opening-death-marker").getAttribute("transform")).toBe("translate(250 120)");
  fireEvent.click(screen.getByRole("button", { name: "ซ่อนทุกรอบ" }));
  expect(screen.queryByTestId("opening-death-marker")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "แสดงทุกรอบ" }));
  expect(screen.getByTestId("opening-death-marker")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "กลับ 0 วินาที" }));
  expect(screen.getByTestId("opening-live-marker")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "0.5×" }));
  expect(screen.getByRole("button", { name: "0.5×" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(screen.getByRole("region", { name: "ตัวเล่นช่วงเปิดรอบ" }), { key: "ArrowRight" });
  expect((timeline as HTMLInputElement).value).toBe("1");
});
