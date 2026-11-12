import type { OpeningPoint, OpeningRound, Px } from "@/shared/api";

export function openingAt(round: OpeningRound, time: number): { marker: Px | null; deathMarker: Px | null } {
  let marker: Px | null = null;
  if (round.death_t != null && round.death_t >= 0 && time >= round.death_t) {
    const last = round.segments.flat().filter((point) => point.t <= round.death_t!).at(-1);
    return { marker: null, deathMarker: round.death_px ?? last?.px ?? null };
  }
  for (const segment of round.segments) {
    const seen = segment.filter((p) => p.t <= time);
    if (!seen.length) continue;
    const last = seen[seen.length - 1];
    const next = segment[seen.length];
    if (time <= segment[segment.length - 1].t) {
      marker = next && next.t > last.t && next.t - last.t <= round.max_gap
        ? between(last, next, time) : last.px;
    } else if (segment === round.segments.at(-1) && time - last.t <= round.max_gap) {
      marker = last.px;
    }
  }
  return { marker, deathMarker: null };
}

function between(a: OpeningPoint, b: OpeningPoint, time: number): Px {
  const f = Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t)));
  return [a.px[0] + (b.px[0] - a.px[0]) * f, a.px[1] + (b.px[1] - a.px[1]) * f];
}
