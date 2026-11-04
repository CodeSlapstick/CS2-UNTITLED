import { describe, expect, it } from "vitest";
import { SAMPLE_DURATION, sampleDeaths, sampleLiveAt, samplePositions, sampleRound, sampleEvents } from "./homeReplay";

describe("demo preview", () => {
  it("uses Dust2 and the source round's duration and events", () => {
    expect(sampleRound.radar?.map).toBe("de_dust2");
    expect(sampleRound.round.num).toBe(18);
    expect(SAMPLE_DURATION).toBeGreaterThanOrEqual(samplePositions.t_end);
    expect(sampleEvents.find((event) => event.key === "plant")?.time).toBe(sampleRound.round.bomb_planted_t);
    expect(sampleEvents.find((event) => event.key === "defuse")?.time).toBe(sampleRound.round.bomb_resolved_t);
  });

  it("hides deaths at the recorded time and restores the original state when seeking back", () => {
    const start = sampleLiveAt(0);
    expect(start.length).toBeGreaterThan(0);
    for (const death of sampleDeaths) {
      if (death.t_round == null) continue;
      expect(sampleLiveAt(death.t_round).some((p) => p.steamid === death.victim.steamid)).toBe(false);
      expect(sampleLiveAt(SAMPLE_DURATION).some((p) => p.steamid === death.victim.steamid)).toBe(false);
    }
    expect(sampleLiveAt(0)).toEqual(start);
  });

  it("interpolates positions from the actual demo snapshots", () => {
    const first = samplePositions.frames[0];
    const second = samplePositions.frames[1];
    const midpoint = sampleLiveAt((first.t + second.t) / 2);
    for (const player of midpoint) {
      const from = first.players.find((p) => p.steamid === player.steamid)!;
      const to = second.players.find((p) => p.steamid === player.steamid);
      if (!to) continue;
      expect(player.px[0]).toBeCloseTo((from.px[0] + to.px[0]) / 2);
      expect(player.px[1]).toBeCloseTo((from.px[1] + to.px[1]) / 2);
    }
  });
});
