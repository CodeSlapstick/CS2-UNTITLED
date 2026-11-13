import { describe, expect, it } from "vitest";
import type { PlayerMatch } from "@/shared/api";
import { formSeries } from "./PlayerFormChart";

const matches = Array.from({ length: 6 }, (_, i) => ({ match_id: i + 1, imported_at: `2026-11-0${i + 1}T00:00:00Z`, adr: (i + 1) * 10, kast: 50 + i, rating: 1 + i / 10 } as PlayerMatch));
describe("player form history", () => {
  it("orders imports oldest first without changing the API response", () => {
    const input = [...matches].reverse();
    expect(formSeries(input, "adr").map(p => p.match.match_id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input[0].match_id).toBe(6);
  });
  it("uses the selected metric", () => {
    expect(formSeries(matches, "kast")[4].value).toBe(54);
    expect(formSeries(matches, "rating")[5].value).toBe(1.5);
  });
  it("keeps missing measurements distinct from zero", () => {
    const input = matches.map(m => ({ ...m }));
    input[2].adr = NaN;
    const points = formSeries(input, "adr");
    expect(points[2].value).toBeNull();
    expect(formSeries([], "adr")).toEqual([]);
  });
});
