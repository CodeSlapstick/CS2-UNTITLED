import { describe, expect, it } from "vitest";
import type { OpeningRound } from "@/shared/api";
import { openingAt } from "./openingRoutePlayback";

export const sampleOpeningRound: OpeningRound = {
  key: "1:1", demo_file: "match.dem", match_name: "Alpha vs Bravo", match_date: null,
  round_num: 1, side: "t", clock_available: true, max_gap: 1.5,
  segments: [[{ t: 0, px: [100, 100] }, { t: 1, px: [200, 100] }]],
  death_t: 1.25, death_px: [250, 120], utility: [],
};

describe("opening replay", () => {
  it("replaces the living marker with the recorded death location and restores it on rewind", () => {
    expect(openingAt(sampleOpeningRound, .5)).toEqual({ marker: [150, 100], deathMarker: null });
    expect(openingAt(sampleOpeningRound, 1.2).marker).toEqual([200, 100]);
    expect(openingAt(sampleOpeningRound, 1.25)).toEqual({ marker: null, deathMarker: [250, 120] });
    expect(openingAt(sampleOpeningRound, 30).deathMarker).toEqual([250, 120]);
    expect(openingAt(sampleOpeningRound, 0)).toEqual({ marker: [100, 100], deathMarker: null });
  });

  it("uses only the last position before death when older responses lack death coordinates", () => {
    const round = { ...sampleOpeningRound, death_px: null,
      segments: [...sampleOpeningRound.segments, [{ t: 2, px: [999, 999] as [number, number] }]] };
    expect(openingAt(round, 4).deathMarker).toEqual([200, 100]);
  });

  it("does not bridge missing segments or invent a position without evidence", () => {
    const round = { ...sampleOpeningRound, death_t: null, death_px: null,
      segments: [...sampleOpeningRound.segments, [{ t: 5, px: [500, 500] as [number, number] }]] };
    expect(openingAt(round, 3)).toEqual({ marker: null, deathMarker: null });
    expect(openingAt({ ...sampleOpeningRound, death_px: null, segments: [] }, 3).deathMarker).toBeNull();
    expect(openingAt({ ...sampleOpeningRound, death_t: 0 }, 0).deathMarker).toEqual([250, 120]);
  });
});
