// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReviewDeath } from "@/shared/api";
import { LangProvider } from "@/shared/i18n";
import { KillFeed } from "./KillFeed";

afterEach(cleanup);
const deaths = Array.from({ length: 7 }, (_, i) => ({
  order: i + 1, tick: (i + 1) * 64, t_round: i + 1,
  attacker: { name: `Attacker ${i + 1}`, side: "ct" }, victim: { name: `Victim ${i + 1}`, side: "t" },
  assister: null, weapon: "unknown", headshot: i === 0,
})) as ReviewDeath[];

it("shows only the latest five recorded kills and removes future events when seeking back", () => {
  const seek = vi.fn();
  const view = render(<LangProvider><KillFeed deaths={deaths} time={6} onSeek={seek} /></LangProvider>);
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  expect(screen.queryByText("Attacker 7")).toBeNull();
  expect(screen.queryByText("Attacker 1")).toBeNull();
  fireEvent.click(screen.getAllByRole("button")[0]);
  expect(seek).toHaveBeenCalledWith(deaths[5]);
  view.rerender(<LangProvider><KillFeed deaths={deaths} time={1} onSeek={seek} /></LangProvider>);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByText("Attacker 6")).toBeNull();
  view.rerender(<LangProvider><KillFeed deaths={deaths} time={0} onSeek={seek} /></LangProvider>);
  expect(screen.queryByTestId("kill-feed")).toBeNull();
});

it("handles world deaths and ignores unknown and negative timestamps", () => {
  const events = [{ ...deaths[0], attacker: null, assister: "Helper" },
    { ...deaths[1], t_round: null }, { ...deaths[2], t_round: -1 }];
  render(<LangProvider><KillFeed deaths={events} time={10} onSeek={vi.fn()} /></LangProvider>);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("+ Helper")).toBeTruthy();
});
