import type { RoundDetail, RoundPositions, ReviewPerson } from "@/shared/api";
import { playersAt, defuseAt, defuseCountdown, defuseHasKit } from "@/features/rounds/playback";
import roundData from "./data/home-round.json";
import positionData from "./data/home-positions.json";

// Round 18 from the demo supplied for the homepage preview.
export const sampleRound = roundData as unknown as Pick<RoundDetail, "round" | "radar" | "teams" | "deaths" | "grenades" | "damages">;
export const samplePositions = positionData as unknown as RoundPositions;
export const SAMPLE_DURATION = Math.max(samplePositions.t_end, sampleRound.round.duration ?? 0,
  ...sampleRound.deaths.map((death) => (death.t_round ?? 0) + 1));
export const sampleDeaths = sampleRound.deaths;
export const sampleGrenades = sampleRound.grenades;
export const samplePeople: ReviewPerson[] = sampleRound.teams.flatMap((team) => team.players.map((p) => ({
  steamid: p.steamid, name: p.name, color: p.color, slot: p.slot, side: p.side, team: team.clan,
})));
const roster = new Map(samplePeople.map((person) => [person.steamid, person]));
export const sampleLiveAt = (time: number) => playersAt(samplePositions, time, roster)
  .filter((p) => !sampleDeaths.some((death) => death.victim.steamid === p.steamid && death.t_round != null && death.t_round <= time));
export function sampleDefuseAt(time: number) {
  const round = sampleRound.round;
  const active = defuseAt(round.defuses, time, round.bomb_resolved_t, round.end_reason, 128);
  if (!active) return null;
  const player = sampleLiveAt(time).find((p) => p.steamid === active.event.steamid);
  if (!player) return null;
  const hasKit = defuseHasKit(active.event, active.completed, player.hasDefuser);
  const countdown = defuseCountdown(active.event, time, hasKit, active.completed);
  return { player, progress: countdown.progress * 100 };
}
export const sampleEvents = [
  ...sampleDeaths.map((event, index) => ({ time: event.t_round ?? 0,
    side: event.attacker?.side ?? event.victim.side ?? "ct",
    label: `${event.attacker?.name ?? "?"} > ${event.victim.name}`, key: `kill-${index}` })),
  ...(sampleRound.round.bomb_planted_t == null ? [] : [{ time: sampleRound.round.bomb_planted_t,
    side: "bomb", label: "Bomb planted", key: "plant" }]),
  ...(sampleRound.round.end_reason === "bomb_defused" && sampleRound.round.bomb_resolved_t != null
    ? [{ time: sampleRound.round.bomb_resolved_t, side: "ct", label: "Bomb defused", key: "defuse" }] : []),
].sort((a, b) => a.time - b.time);
