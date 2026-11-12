import type { ScoreRow } from "@/shared/api";
import { useT } from "@/shared/i18n";
import type { AnalysisSide as Side } from "./useDeathAnalysis";

const SIDES: { key: Side; label: string }[] = [
  { key: "all", label: "ทั้งสองฝั่ง" },
  { key: "ct", label: "ตอนเป็น CT" },
  { key: "t", label: "ตอนเป็น T" },
];

interface HeatmapControlsProps {
  side: Side;
  onSide: (s: Side) => void;
  demoSelected: boolean;
  roundsTotal: number;
  selRounds: number[] | null;
  onRounds: (r: number[] | null) => void;
  roster: ScoreRow[];
  teamRoster?: { steam_id: string; team: string | null }[];
  ownTeam?: string | null;
  rosterLoading: boolean;
  selPlayers: string[] | null;
  onPlayers: (p: string[] | null) => void;
}

export function HeatmapControls({
  side, onSide,
  demoSelected, roundsTotal, selRounds, onRounds, roster, teamRoster = [], ownTeam, rosterLoading, selPlayers, onPlayers,
}: HeatmapControlsProps) {
  const { t } = useT();
  const roundOn = (n: number) => selRounds === null || selRounds.includes(n);
  const toggleRound = (n: number) => {
    const base = selRounds ?? Array.from({ length: roundsTotal }, (_, i) => i + 1);
    onRounds(base.includes(n) ? base.filter((x) => x !== n) : [...base, n].sort((a, b) => a - b));
  };
  const playerOn = (id: string) => selPlayers === null || selPlayers.includes(id);
  const togglePlayer = (id: string) => {
    const base = selPlayers ?? roster.map((p) => p.steam_id);
    onPlayers(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };
  const teamByPlayer = new Map(teamRoster.map((player) => [player.steam_id, player.team]));
  const teamNames = [...new Set(roster.map((player) => teamByPlayer.get(player.steam_id)).filter((team): team is string => !!team))];
  const groups = teamNames.length ? [
    ...teamNames.map((team) => ({ team, players: roster.filter((player) => teamByPlayer.get(player.steam_id) === team) })),
    { team: null, players: roster.filter((player) => !teamByPlayer.get(player.steam_id)) },
  ].filter((group) => group.players.length) : (["ct", "t", null] as const).map((side) => ({
    team: side ? `${t("ฝั่งเริ่ม")} ${side.toUpperCase()}` : null,
    players: roster.filter((player) => (player.start_side ?? null) === side),
  })).filter((group) => group.players.length);
  if (ownTeam) groups.sort((a, b) => Number(b.team === ownTeam) - Number(a.team === ownTeam));

  return (
    <aside className="hm-panel card heat-panel" aria-label={t("ตั้งค่าการแสดงผล heatmap")}>
      <div className="hm-field">
        <div className="hm-field-h"><span>{t("ฝั่งของคนที่ตาย")}</span></div>
        <div className="seg hm-seg" role="group" aria-label={t("ฝั่งของคนที่ตาย")}>
          {SIDES.map((s) => (
            <button key={s.key} type="button" className={`seg-btn${side === s.key ? ` ${s.key} on` : ""}`}
              aria-pressed={side === s.key} onClick={() => onSide(s.key)}>
              {t(s.label)}
            </button>
          ))}
        </div>
      </div>

      {!demoSelected ? (
        <p className="muted small hm-note">{t('เลือก "แมตช์ของทีม" แมตช์เดียวด้านบนก่อน ถึงจะเจาะจงรอบหรือผู้เล่นได้')}</p>
      ) : (
        <>
          <div className="hm-field">
            <div className="hm-field-h">
              <span>{t("รอบ")}</span>
              <span className="hm-quick">
                <button type="button" className="link-btn" onClick={() => onRounds(null)}>{t("ทั้งหมด")}</button>
                {" · "}
                <button type="button" className="link-btn" onClick={() => onRounds([])}>{t("ไม่เอาเลย")}</button>
              </span>
            </div>
            <div className="hm-round-grid" role="group" aria-label={t("เลือกรอบ")}>
              {Array.from({ length: roundsTotal }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className={`hm-round-btn${roundOn(n) ? " on" : ""}`}
                  aria-pressed={roundOn(n)} onClick={() => toggleRound(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="hm-field">
            <div className="hm-field-h">
              <span>{t("ผู้เล่น")}</span>
              <span className="hm-quick">
                <button type="button" className="link-btn" onClick={() => onPlayers(null)}>{t("ทั้งหมด")}</button>
                {" · "}
                <button type="button" className="link-btn" onClick={() => onPlayers([])}>{t("ไม่เอาเลย")}</button>
              </span>
            </div>
            {rosterLoading ? (
              <p className="muted small">{t("กำลังโหลดรายชื่อ…")}</p>
            ) : (
              <div>
                {groups.map(({ team, players }) => {
                  const label = team && ownTeam ? `${team === ownTeam ? t("ทีมเรา") : t("คู่แข่ง")} · ${team}` : (team ?? t("ไม่ทราบทีม"));
                  return <div className="hm-player-team" key={team ?? "unknown"}>
                  <strong>{label}</strong>
                  <div className="hm-pills" role="group" aria-label={label}>
                {players.map((p) => (
                  <button key={p.steam_id} type="button"
                    className={`hm-pill${playerOn(p.steam_id) ? ` ${p.start_side ?? ""} on` : ""}`}
                    aria-pressed={playerOn(p.steam_id)} onClick={() => togglePlayer(p.steam_id)}>
                    {p.name}
                  </button>
                ))}
                  </div></div>;
                })}
              </div>
            )}
          </div>
        </>
      )}

    </aside>
  );
}
