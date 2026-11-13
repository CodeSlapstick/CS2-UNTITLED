import { type ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  ApiError,
  playerApi,
  type ReviewTeam,
  type RoundDetail,
  type ReplayStats,
} from "@/shared/api";
import {
  clampZoom,
  fmtT,
  MAX_ZOOM,
  MatchTabs,
  nadeLabel,
  NADE_TYPES,
  type NadeType,
  NotFound,
  sideLabel,
  type ViewState,
  weaponLabel,
} from "@/shared/ui/utils";
import { useT } from "@/shared/i18n";
import { defuseAt, defuseCountdown, defuseHasKit, playersAt, replayStatsAt, type LivePlayer } from "./playback";
import { PLAYBACK_SPEEDS as SPEEDS, useRoundPlayback } from "./useRoundPlayback";
import { clampRadarCenter, DefuseHud, MapView, NadeMiniIcon } from "./RoundMap";

// Preserve existing imports while rendering lives in its own module.
export { DefuseHud, GrenadeGlyph, MapView, placeLivePlayerLabels, PlantedBomb, PlaybackDeathMarker, truncatePlayerName } from "./RoundMap";
import { EquipmentIcon, WeaponIcon, isReplayWeapon, isHeldUtility } from "@/shared/ui/gameIcons";
import { KillFeed } from "./KillFeed";

// ================================================================================================
// ================================================================================================
interface RoundViewProps {
  demo: string;
  roundNum: number;
  view: ViewState;
  setView: (patch: Partial<ViewState>) => void;
  roundSelector?: ReactNode;
  scores?: { ct: number; t: number };
}

export function RoundView({ demo, roundNum, view, setView, roundSelector, scores }: RoundViewProps) {
  const [hover, setHover] = useState<string | null>(null);
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  const q = useQuery({
    queryKey: ["review-round", demo, roundNum],
    queryFn: () => api.reviewRound(demo, roundNum),
    placeholderData: (prev: RoundDetail | undefined) => (prev && prev.match.demo_file === demo ? prev : undefined),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  const positions = useQuery({
    queryKey: ["review-positions", demo, roundNum],
    queryFn: () => api.reviewPositions(demo, roundNum),
    enabled: true,
    staleTime: Infinity, // ตำแหน่งของรอบที่แกะแล้วไม่เปลี่ยน
  });
  const latestEventT = Math.max(0, q.data?.round.latest_event_t ?? 0,
    ...(q.data?.deaths.map((death) => death.t_round ?? 0) ?? []));
  const endT = q.data ? Math.max(q.data.round.duration ?? 0, latestEventT + 1, positions.data?.t_end ?? 0) : 0;

  const { playing, setPlaying, speed, setSpeed, time, setTime } = useRoundPlayback({
    roundKey: `${demo}/${roundNum}`, view, setView, positions: positions.data, endT,
  });

  if (q.isLoading) return <p className="muted" role="status">{t("กำลังโหลดรอบ {n}…", { n: roundNum })}</p>;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFound title={t("ไม่พบรอบนี้")} detail={q.error.message} />;
  if (q.error) return <p className="err" role="alert">{t("โหลดรอบนี้ไม่ได้: {msg}", { msg: (q.error as Error).message })}</p>;
  if (!q.data) return null;

  const d = q.data;
  const shownNades = d.grenades.filter((g) => view.nades.includes(g.type as NadeType));
  const anyNadeOn = shownNades.length > 0;
  const pos = positions.data;
  const roster = new Map(
    d.teams.flatMap((t) => t.players.map((p) => [p.steamid, { name: p.name, color: p.color, slot: p.slot }] as const)),
  );
  const deadIds = new Set(d.deaths.filter((death) => death.t_round != null && death.t_round >= 0 && death.t_round <= time)
    .map((death) => death.victim.steamid));
  const live = pos ? playersAt(pos, time, roster).filter((player) => !deadIds.has(player.steamid)) : null;
  const defuseState = defuseAt(d.round.defuses, time, d.round.bomb_resolved_t, d.round.end_reason, d.match.tickrate);
  const activeDefuse = defuseState?.event ?? null;
  const defusingPlayer = activeDefuse ? live?.find((player) => player.steamid === activeDefuse.steamid && player.side === "ct") : null;
  const hasKit = activeDefuse
    ? defuseHasKit(activeDefuse, defuseState?.completed ?? false, defusingPlayer?.hasDefuser) : false;
  const defuseTimer = activeDefuse
    ? defuseCountdown(activeDefuse, time, hasKit, defuseState?.completed) : null;
  const defuseRemaining = defuseTimer?.remaining ?? null;
  const defuseProgressPercent = defuseTimer ? defuseTimer.progress * 100 : null;
  const shownDeaths = d.deaths.filter((x) => time > 0 && x.t_round != null && x.t_round >= 0 && x.t_round <= time);
  const plantT = d.round.bomb_planted_t;
  const bombActive = (plantT == null ? time > 0 : time >= plantT && time < plantT + 40)
    && (d.round.bomb_resolved_t == null || time < d.round.bomb_resolved_t);
  const shownBomb = bombActive ? d.round.bomb : null;
  const bombRemaining = bombActive && plantT != null && d.radar
    ? Math.max(0, 40 - (time - plantT)) : null;
  const focusPlayer = hover ?? view.player;

  return (
    <div className="review viewer2d" data-testid="round-view">
      <div className="review-head">
        <h2>
          2D VIEWER <span className="viewer-round-label">{t("รอบ {n}", { n: d.round.num })}</span>
          {d.round.winner_side && <span className={`badge b-${d.round.winner_side} big`}>{t("{side} ชนะ", { side: sideLabel(d.round.winner_side) })}</span>}
        </h2>
        <div className="toggles">
          <span className="toggle-group">
            <span className="muted">{t("ระเบิด")}</span>
            {NADE_TYPES.map((k) => {
              const n = d.grenades.filter((g) => g.type === k).length;
              const on = n > 0 && view.nades.includes(k);   // รอบนี้ไม่มีชนิดนี้เลย = ปุ่มดับไว้ ไม่นับว่าเปิดอยู่
              return (
                <label key={k} className={`nade-toggle${on ? " on" : ""}`} title={t("{nade} {n} ลูกในรอบนี้", { nade: nadeLabel(k), n })}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={n === 0}
                    onChange={(e) => setView({ nades: e.target.checked ? [...view.nades, k] : view.nades.filter((x) => x !== k) })}
                  />
                  <NadeMiniIcon type={k} />
                  {nadeLabel(k)} {n}
                </label>
              );
            })}
            <button
              type="button"
              className="link-btn"
              onClick={() => setView({ nades: anyNadeOn ? [] : [...NADE_TYPES] })}
              disabled={d.grenades.length === 0}
            >
              {anyNadeOn ? t("ปิดทั้งหมด") : t("เปิดทั้งหมด")}
            </button>
            {anyNadeOn && view.death != null && <span className="muted">· {t("เฉพาะที่มีผลตอนการตาย #{n}", { n: view.death })}</span>}
          </span>
        </div>
      </div>

      {/* หน้าจอ laptop / projector: สามส่วนนี้อยู่ในความสูงจอเดียว แผนที่เป็นจัตุรัสเท่าที่ช่องให้ได้ (styles.css) */}
      <div className="review-grid">
        <aside className="roster-col" aria-label={t("ตารางระบุตัวผู้เล่น")}>
          <TeamRoster
            teams={d.teams}
            scores={scores}
            scoreboard={d.scoreboard_start ? replayStatsAt(d, time) : undefined}
            highlight={focusPlayer}
            onHighlight={(p) => setView({ player: p })}
            onHover={setHover}
            playback
            live={live}
            bombPlanted={plantT != null && time >= plantT}
          />
          {view.player && (
            <button type="button" className="link-btn" onClick={() => setView({ player: null })}>
              {t("ล้างการไฮไลต์")}
            </button>
          )}
        </aside>

        <section className="map-col" aria-label={t("แผนที่ของรอบ")}>
          <div className="viewer-map-toolbar"><MatchTabs demo={demo} /></div>
          <div className="viewer-time-overlay" aria-live="off">
            <span><small>Replay</small><b>{fmtT(time)} / {fmtT(endT)}</b></span>
            {bombRemaining != null && <span className={bombRemaining <= 10 ? "critical" : ""}><small>C4</small><b>{fmtT(bombRemaining)}</b></span>}
          </div>
          {/* C4 HUD กับปุ่มซูมอยู่ในหัวการ์ดเหนือภาพเรดาร์ เพื่อไม่บังพื้นที่เล่นบนแผนที่ */}
          <div className="map-card-header">
            {defuseRemaining != null && defuseProgressPercent != null &&
              <DefuseHud remaining={defuseRemaining} progressPercent={defuseProgressPercent} />}
            <div className="map-zoom" role="group" aria-label={t("ซูมแผนที่")}>
              <button type="button" onClick={() => {
                const next = clampZoom(view.zoom * 1.4);
                setView({ zoom: next, center: d.radar ? clampRadarCenter(view.center, d.radar.size, next) : null });
              }}
                disabled={view.zoom >= MAX_ZOOM} aria-label={t("ซูมเข้า")} title={t("ซูมเข้า (หรือเลื่อนล้อเมาส์บนแผนที่)")}>+</button>
              <button type="button" onClick={() => {
                const next = clampZoom(view.zoom / 1.4);
                setView(next <= 1.01 ? { zoom: 1, center: null } : {
                  zoom: next, center: d.radar ? clampRadarCenter(view.center, d.radar.size, next) : null,
                });
              }} disabled={view.zoom <= 1} aria-label={t("ซูมออก")} title={t("ซูมออก")}>−</button>
              {view.zoom > 1 && (
                <button type="button" className="mz-reset" onClick={() => setView({ zoom: 1, center: null })}
                  title={t("กลับไปเห็นเต็มแมพ")}>
                  {t("เต็มแมพ")}
                </button>
              )}
            </div>
          </div>
          <div className="map-stage">
            {d.radar ? (
              <MapView
                radar={d.radar}
                deaths={shownDeaths}
                bomb={shownBomb}
                defuseBombPx={d.round.bomb?.px}
                bombPlantedT={plantT}
                grenades={shownNades}
                damages={d.damages}
                positions={pos}
                startTick={d.round.start_tick}
                tickrate={d.match.tickrate}
                live={live}
                defusingPlayer={defusingPlayer}
                defuseProgressPercent={defuseProgressPercent}
                playbackTime={time}
                reducedMotion={reducedMotion}
                zoom={view.zoom}
                center={view.center}
                onView={(zoom, center) => setView({ zoom, center })}
                highlight={focusPlayer}
                onHover={setHover}
                selected={view.death}
                onSelect={(o) => setView({ death: o })}
              />
            ) : (
              <p className="muted">{t("ยังไม่มีภาพเรดาร์ของแมพ {map}", { map: d.match.map_name ?? "" })}</p>
            )}
          </div>
          <KillFeed deaths={d.deaths} time={time} onSeek={death => {
            const seekTime = Math.min(endT, Math.ceil(death.t_round! * 10) / 10);
            setPlaying(false);
            setTime(seekTime);
            setView({ death: death.order, time: seekTime });
          }} />
          <div className="map-play viewer-controls">
            {positions.isLoading ? (
              <span className="muted small">{t("กำลังโหลดตำแหน่งผู้เล่น…")}</span>
            ) : positions.error ? (
              <span className="err small">{t("โหลดตำแหน่งไม่ได้: {msg}", { msg: (positions.error as Error).message })}</span>
            ) : endT <= 0 ? (
              <span className="muted small">{t("รอบนี้ไม่มีตำแหน่งผู้เล่นที่บันทึกไว้")}</span>
            ) : (
              <>
                <button type="button" className="pb-play" onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? t("หยุด") : t("เล่น")} aria-pressed={playing} title={t("เว้นวรรค = เล่น/หยุด")}>
                  {playing ? <IconPause /> : <IconPlay />}
                </button>
                <input
                  className="pb-range"
                  type="range"
                  min={0}
                  max={endT}
                  step={0.1}
                  value={Math.min(time, endT)}
                  onChange={(e) => {
                    setPlaying(false);
                    setTime(Number(e.target.value));
                  }}
                  aria-label={t("เลื่อนเวลาในรอบ")}
                  title={t(", กับ . = ถอย/เดินหน้าทีละวินาที")}
                />
                <div className="event-markers" aria-hidden="true">
                  {d.deaths.filter((event) => event.t_round != null).map((event) => <i key={`k${event.order}`} className="kill" style={{ left: `${(event.t_round! / endT) * 100}%` }} />)}
                  {plantT != null && <i className="plant" style={{ left: `${(plantT / endT) * 100}%` }} />}
                  {d.round.bomb_resolved_t != null && <i className="resolved" style={{ left: `${(d.round.bomb_resolved_t / endT) * 100}%` }} />}
                </div>
                <span className="pb-speeds" role="group" aria-label={t("ความเร็ว")}>
                  {SPEEDS.map((sp) => (
                    <button key={sp} type="button" className={`pb-speed${speed === sp ? " on" : ""}`}
                      aria-pressed={speed === sp} onClick={() => setSpeed(sp)}>
                      {sp}×
                    </button>
                  ))}
                </span>
              </>
            )}
            <span className="viewer-control-hint">Space · ← →</span>
          </div>
          {/* เลือกรอบจากใต้ตัวควบคุมแผนที่ เพื่อเปลี่ยนรอบได้ทันทีหลังดูเล่นย้อน */}
          {roundSelector}
          {pos && pos.frames.length > 0 && <p className="muted small pb-note">{t(pos.note)}</p>}
          {anyNadeOn && (
            <div className="legend">
              {NADE_TYPES.map((t) => (
                <span key={t}>
                  <NadeMiniIcon type={t} /> {nadeLabel(t)}
                </span>
              ))}
              <span className="muted">{t("เส้นทึบ = ตำแหน่ง projectile จากเดโม · เส้นประ = เส้นประมาณจากจุดขว้างถึงจุดตก · วง utility เป็นขนาดเพื่อการแสดงผล")}</span>
            </div>
          )}
        </section>

      </div>
      {view.player && <ViewerPlayerDetails
        steamid={view.player}
        matchId={d.match.id}
        team={d.teams.find((team) => team.players.some((player) => player.steamid === view.player))?.clan ?? "—"}
        current={live?.find((player) => player.steamid === view.player) ?? null}
        onClose={() => setView({ player: null })}
      />}
    </div>
  );
}


function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}


interface RosterProps {
  teams: ReviewTeam[];
  scoreboard?: ReplayStats[];
  scores?: { ct: number; t: number };
  highlight: string | null;
  onHighlight: (steamid: string | null) => void;
  onHover: (steamid: string | null) => void;
  playback: boolean;
  live?: LivePlayer[] | null;
  bombPlanted?: boolean;
}

function ViewerPlayerDetails({ steamid, matchId, team, current, onClose }: {
  steamid: string; matchId: number; team: string; current: LivePlayer | null; onClose: () => void;
}) {
  const { t } = useT();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const summary = useQuery({ queryKey: ["player", steamid], queryFn: () => playerApi.summary(steamid), retry: false });
  const match = useQuery({ queryKey: ["match", matchId], queryFn: () => api.match(matchId) });
  const matchPlayer = match.data?.scoreboard.find((player) => player.steam_id === steamid);
  const total = summary.data?.totals;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, []);
  return (
    <div className="viewer-player-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="viewer-player-details" role="dialog" aria-modal="true" aria-labelledby="viewer-player-title">
      <header><div><small>{team}</small><strong id="viewer-player-title">{summary.data?.player.name ?? current?.name ?? steamid}</strong></div><button ref={closeRef} type="button" onClick={onClose} aria-label={t("ปิดรายละเอียดผู้เล่น")}>×</button></header>
      <div className="viewer-player-scroll">
        <section><h3>{t("สถานะ ณ เวลา replay ปัจจุบัน")}</h3><dl className="viewer-live-stats">
          <div><dt>HP</dt><dd>{current?.hp ?? 0}</dd></div><div><dt>{t("เกราะ")}</dt><dd>{current?.armor ?? 0}</dd></div>
          <div><dt>{t("เงิน")}</dt><dd>{current?.money == null ? "ไม่มีข้อมูล" : `$${current.money.toLocaleString()}`}</dd></div><div><dt>C4</dt><dd>{current?.hasBomb ? t("ถือ C4") : "—"}</dd></div>
          <div><dt>{t("อาวุธ")}</dt><dd>{current?.activeWeapon ? weaponLabel(current.activeWeapon) : "—"}</dd></div><div><dt>{t("ตำแหน่ง")}</dt><dd>{current?.place ?? t("เสียชีวิต")}</dd></div>
        </dl></section>
        <section><h3>{t("สถิติทั้งแมตช์นี้")}</h3>{match.isLoading ? <p className="muted small">{t("กำลังโหลด…")}</p> : matchPlayer ? <dl className="viewer-match-stats">
          <div><dt>K / D / A</dt><dd>{matchPlayer.kills} / {matchPlayer.deaths} / {matchPlayer.assists}</dd></div><div><dt>Rating</dt><dd>{matchPlayer.rating.toFixed(2)}</dd></div>
          <div><dt>ADR</dt><dd>{matchPlayer.adr.toFixed(1)}</dd></div><div><dt>KAST</dt><dd>{matchPlayer.kast.toFixed(0)}%</dd></div><div><dt>HS</dt><dd>{matchPlayer.hs_rate.toFixed(0)}%</dd></div>
        </dl> : <p className="muted small">{t("ไม่มีสถิติของผู้เล่นในแมตช์นี้")}</p>}</section>
        <section><h3>{t("สถิติรวมจากเดโมในระบบ")}</h3>{summary.isLoading ? <p className="muted small">{t("กำลังโหลดสถิติ…")}</p> : total ? <dl className="viewer-match-stats">
          <div><dt>K/D</dt><dd>{total.kd.toFixed(2)}</dd></div><div><dt>Rating</dt><dd>{total.rating.toFixed(2)}</dd></div><div><dt>ADR</dt><dd>{total.adr.toFixed(1)}</dd></div><div><dt>KAST</dt><dd>{total.kast.toFixed(0)}%</dd></div><div><dt>{t("แมตช์")}</dt><dd>{total.matches}</dd></div>
        </dl> : <p className="muted small">{t("ยังไม่มีสถิติรวม")}</p>}</section>
      </div>
    </section>
    </div>
  );
}

/**
 *
 *
 */
export function TeamRoster({ teams, scores, scoreboard, highlight, onHighlight, onHover, playback, live, bombPlanted = false }: RosterProps) {
  const { t: tx } = useT();
  const liveById = new Map((live ?? []).map((p) => [p.steamid, p]));
  const statsById = new Map((scoreboard ?? []).map((p) => [p.steam_id, p]));
  return (
    <div className="roster" data-testid="team-roster">
      {teams.map((t) => (
        <div className={`team-box side-${t.side_this_round}`} key={t.clan}>
          <div className="team-head">
            <b>{t.clan}</b>
            <span className={`badge b-${t.side_this_round}`}>{sideLabel(t.side_this_round)}</span>
            <strong className="team-score">{scores?.[t.side_this_round] ?? "—"}</strong>
          </div>
          <ul>
            {[...t.players].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)).map((p) => {
              const now = liveById.get(p.steamid);
              const stats = statsById.get(p.steamid);
              const utilities = now?.utilityInventory ?? (isHeldUtility(now?.activeWeapon) ? [now!.activeWeapon!] : []);
              const deadNow = playback && live ? !now : !p.survived;
              const hp = Math.max(0, Math.min(100, now?.hp ?? (deadNow ? 0 : 100)));
              return (
              <li
                key={p.steamid}
                className={[
                  highlight === p.steamid ? "on" : highlight ? "dim" : "",
                  deadNow ? "dead" : "",
                ].filter(Boolean).join(" ")}
                onMouseEnter={() => onHover(p.steamid)}
                onMouseLeave={() => onHover(null)}
                data-testid="roster-row"
                data-slot={p.slot ?? ""}
                data-dead={deadNow ? "1" : "0"}
              >
                <button
                  type="button"
                  className="pname"
                  onClick={() => onHighlight(highlight === p.steamid ? null : p.steamid)}
                  title={tx("กดเพื่อไฮไลต์เฉพาะเหตุการณ์ของคนนี้ค้างไว้")}
                >
                  <span className="pn">{p.name}</span>
                  <span className="player-money" title={now?.money == null ? tx("ไม่มีข้อมูลเงินใน replay นี้") : undefined}>{now?.money == null ? "—" : <><span className="player-currency">$</span>{now.money.toLocaleString()}</>}</span>
                  {!bombPlanted && now?.hasBomb && <span className="roster-c4" title={tx("ถือ C4")} aria-label={tx("ถือ C4")}><EquipmentIcon kind="bomb" /></span>}
                  <span className="roster-weapon-slot">{isReplayWeapon(now?.activeWeapon) && <WeaponIcon name={now?.activeWeapon} className="roster-weapon" />}</span>
                  <span className="roster-health" role="meter" aria-label={`${p.name} HP`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hp} title={`${hp} HP`}>
                    <span style={{ width: `${hp}%` }} />
                  </span>
                </button>
                <div className="roster-loadout">
                {playback && now && (utilities.length > 0 || now.armor || now.hasHelmet || now.hasDefuser) && (
                  <div className="pgear" aria-label={tx("อุปกรณ์ปัจจุบัน")}>
                    {now.hasHelmet ? <EquipmentIcon kind="helmet" className="pgear-small" /> : now.armor ? <EquipmentIcon kind="kevlar" className="pgear-small" /> : null}
                    {now.hasDefuser && <EquipmentIcon kind="defuser" className="pgear-small" />}
                    {utilities.map((name, index) => <span className="roster-utility" title={weaponLabel(name)} key={`${name}-${index}`}><WeaponIcon name={name} className="pgear-small" /></span>)}
                  </div>
                )}
                <span className="roster-kda" title={`${tx("สถิติสะสมถึงเวลารีเพลย์")} · K / D / A`} aria-label={`${p.name} · ${tx("สถิติสะสมถึงเวลารีเพลย์")} · K / D / A: ${stats ? `${stats.kills} / ${stats.deaths} / ${stats.assists}` : "—"}`}>
                  <small>K / D / A</small> {stats ? `${stats.kills} / ${stats.deaths} / ${stats.assists}` : "— / — / —"}
                </span>
                </div>
                <div className="pstat">
                  {p.survived ? (
                    <span className="alive">{tx("รอดถึงจบรอบ")}</span>
                  ) : (
                    <>
                      {tx("ตาย {time} · {weapon}", { time: fmtT(p.died_at_t), weapon: weaponLabel(p.weapon) })}
                      {p.killed_by ? ` · ${tx("โดย {name}", { name: p.killed_by })}` : ""}
                      {p.death_order ? <span className="muted"> (#{p.death_order})</span> : null}
                    </>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="roster-note muted small">
        {playback
          ? tx("เลขบนแผนที่ = หมายเลขผู้เล่นในตารางนี้ · ✕ = ตายแล้ว")
          : tx("เลขบนแผนที่ = ลำดับการตาย (ตรงกับไทม์ไลน์) · เลขในตารางนี้ = หมายเลขผู้เล่น ใช้ตอนเล่นย้อน")}
      </p>
    </div>
  );
}

function IconPlay() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4.5 20 12 7 19.5Z" fill="currentColor" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 4.5h3.5v15H7.5zM13 4.5h3.5v15H13z" fill="currentColor" />
    </svg>
  );
}
