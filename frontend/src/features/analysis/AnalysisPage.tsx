import { type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  type DeathCellCount,
  type DeathsOverlay,
  type Match,
  type PlayerBehavior,
  type PlayerBehaviorProfile,
} from "@/shared/api";
import {
  DIFF_FILL,
  DIFF_MIN_DEATHS,
  DEATH_RAMP,
  DIFF_STEPS,
  diffLevel,
  type DiffLevel,
  pct,
  RATIO_RAMP,
  sideLabel,
} from "@/shared/ui/utils";
import { useT } from "@/shared/i18n";
import { PlayerIcon } from "@/shared/assets/icons/player-icon";
import { DatabaseSearchIcon } from "@/shared/assets/icons/database-search-icon";
import { OpeningRoutePage } from "@/features/opening/OpeningRoutePage";
import { HeatmapControls } from "./HeatmapControls";
import { useDeathAnalysis, type AnalysisMode as Mode } from "./useDeathAnalysis";

/**
 *
 *
 *
 */
type Side = "all" | "ct" | "t";
type TFn = (s: string, vars?: Record<string, string | number>) => string;

const MODES: { key: Mode; label: string }[] = [
  {
    key: "upload",
    label: "ทีมเราตายตรงไหน",
  },
  {
    key: "opening",
    label: "Opening Route",
  },
];

function modeFromParams(params: URLSearchParams): Mode {
  return params.get("tool") === "opening-route" ? "opening" : "upload";
}

export function AnalysisPage() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const mode = modeFromParams(params);
  function setMode(nextMode: Mode) {
    const next = new URLSearchParams(params);
    if (nextMode === "opening") next.set("tool", "opening-route");
    else {
      for (const key of ["tool", "player", "map", "side", "scope"]) next.delete(key);
    }
    setParams(next, { replace: true });
  }
  function moveMode(event: KeyboardEvent<HTMLButtonElement>, current: Mode) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const currentIndex = MODES.findIndex((item) => item.key === current);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? MODES.length - 1
        : (currentIndex + delta + MODES.length) % MODES.length;
    const nextMode = MODES[nextIndex].key;
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-testid="mode-${nextMode}"]`)
      ?.focus();
    setMode(nextMode);
  }
  const {
    side, setSide, hovered, setHovered, selRounds, setSelRounds, selPlayers, setSelPlayers,
    matches, maps, mapMatches, activeMap, setMap, selectedDemo, setDemo, activeMatch,
    roster, noRoundsPicked, noPlayersPicked, upload, reference, behaviorQ,
  } = useDeathAnalysis(mode);

  if (mode === "opening") {
    return (
      <div className="analysis" data-testid="analysis-page">
        <header className="an-head">
          <h1>{t("เครื่องมือวิเคราะห์")}</h1>
          <div className="an-tabs" role="tablist" aria-label={t("สิ่งที่ดู")}>{MODES.map((m) => (
            <button key={m.key} id={`analysis-tab-${m.key}`} type="button" role="tab" className={`an-tab${mode === m.key ? " on" : ""}`}
              aria-controls={`analysis-panel-${m.key}`} aria-selected={mode === m.key} tabIndex={mode === m.key ? 0 : -1}
              onKeyDown={(event) => moveMode(event, m.key)} onClick={() => setMode(m.key)} data-testid={`mode-${m.key}`}>
              {t(m.label)}
            </button>
          ))}</div>
        </header>
        <div id="analysis-panel-opening" role="tabpanel" aria-labelledby="analysis-tab-opening">
          <OpeningRoutePage embedded />
        </div>
        <div id="analysis-panel-upload" role="tabpanel" aria-labelledby="analysis-tab-upload" hidden />
      </div>
    );
  }

  if (matches.isLoading) return <p className="muted" role="status">{t("กำลังโหลด…")}</p>;
  if (matches.error) return <p className="err" role="alert">{t("โหลดรายการแมตช์ไม่ได้: {msg}", { msg: (matches.error as Error).message })}</p>;
  if (maps.length === 0) return <div className="analysis" data-testid="analysis-page">
    <header className="an-head"><h1>{t("เครื่องมือวิเคราะห์")}</h1></header>
    <section className="card an-no-match" role="status">
      <DatabaseSearchIcon aria-hidden="true" />
      <div><h2>ยังไม่มีแมตช์ที่พร้อมวิเคราะห์</h2><p className="muted">เลือกแมตช์ที่ประมวลผลเสร็จแล้วจากหน้า Matches เพื่อดูผลวิเคราะห์ ข้อมูลอัปโหลดเดโมยังอยู่ที่หน้าหลักของระบบ</p></div>
      <Link className="btn-primary" to="/matches">ไปหน้า Matches</Link>
    </section>
  </div>;

  const single = upload.data;
  const loading = upload.isLoading || (mode === "diff" && reference.isLoading);
  const error = (upload.error ?? reference.error) as Error | null;
  const rows = mode === "diff" && upload.data && reference.data ? compare(upload.data, reference.data) : [];
  const diffGroups = mode === "diff" ? groupDiffRows(rows) : [];

  return (
    <div className="analysis" data-testid="analysis-page">
      <header className="an-head">
        <h1>{t("เครื่องมือวิเคราะห์")}</h1>
        <div className="an-tabs" role="tablist" aria-label={t("สิ่งที่ดู")}>
          {MODES.map((m) => (
            <button key={m.key} id={`analysis-tab-${m.key}`} type="button" role="tab" className={`an-tab${mode === m.key ? " on" : ""}`}
              aria-controls={`analysis-panel-${m.key}`} aria-selected={mode === m.key} tabIndex={mode === m.key ? 0 : -1}
              onKeyDown={(event) => moveMode(event, m.key)} onClick={() => setMode(m.key)} data-testid={`mode-${m.key}`}>
              {t(m.label)}
            </button>
          ))}
        </div>
      </header>

      <div id="analysis-panel-opening" role="tabpanel" aria-labelledby="analysis-tab-opening" hidden />
      <div id="analysis-panel-upload" role="tabpanel" aria-labelledby="analysis-tab-upload">
      <div className="an-filters">
        {maps.length > 1 ? (
          <label className="an-select">
            {t("แมพ")}
            <select name="analysis-map" autoComplete="off" value={activeMap} onChange={(e) => setMap(e.target.value)}>
              {maps.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="an-select">{t("แมพ")} <b className="an-fixed">{activeMap}</b></span>
        )}

        <label className="an-select">
          {t("แมตช์ของทีม")}
          <select name="analysis-demo" autoComplete="off" value={selectedDemo} onChange={(e) => setDemo(e.target.value)}>
            {mapMatches.map((m) => (
              <option key={m.demo_file} value={m.demo_file}>{matchLabel(m)}</option>
            ))}
          </select>
        </label>
      </div>

      {activeMatch && (
        <div className="analysis-context" aria-label={t("แมตช์ที่กำลังวิเคราะห์")}>
          <span><small>{t("ทีม")}</small><strong>{t("ศัตรู")} vs {t("ทีมเรา")}</strong></span>
          <span><small>{t("แผนที่")}</small><strong>{activeMatch.map_name}</strong></span>
          <span><small>{t("แมตช์")}</small><strong>{matchLabel(activeMatch)}</strong></span>
        </div>
      )}

      {error && <p className="err" role="alert">{t("โหลดข้อมูลไม่ได้: {msg}", { msg: error.message })}</p>}
      {loading && <p className="muted" role="status">{t("กำลังนับจุดตาย…")}</p>}

      {!loading && !error && (
        <div className="an-grid">
          {/* แผงนี้อยู่เสมอไม่ว่าจะเลือกรอบ/ผู้เล่นไว้กี่คน — กด "ไม่เอาเลย" แล้วต้องยังเห็นปุ่ม "ทั้งหมด"
              เพื่อย้อนกลับได้ ไม่ใช่ทั้งแผงหายไปพร้อมกับแผนที่จนหาทางกลับไม่เจอ */}
          <HeatmapControls
            side={side} onSide={setSide}
            demoSelected={!!activeMatch}
            roundsTotal={activeMatch?.rounds ?? 0}
            selRounds={selRounds} onRounds={setSelRounds}
            roster={roster.data?.scoreboard ?? []}
            rosterLoading={roster.isLoading}
            selPlayers={selPlayers} onPlayers={setSelPlayers}
          />

          {noRoundsPicked || noPlayersPicked ? (
            <p className="muted an-empty an-empty-fill" data-testid="analysis-nothing-picked">
              {noRoundsPicked
                ? t('เลือกรอบอย่างน้อยหนึ่งรอบ หรือกด "ทั้งหมด"')
                : t('เลือกผู้เล่นอย่างน้อยหนึ่งคน หรือกด "ทั้งหมด"')}
            </p>
          ) : (
            <>
              <section className="an-map-col">
                <div className="an-map">
                  {mode === "diff" ? (
                    <DeathMap radar={upload.data!.radar} cells={rows} paint={(r) => diffPaint(r.level)}
                      zoneFill={zoneRatioFill(diffGroups)}
                      highlightKey={hovered} onHoverKey={setHovered} />
                  ) : (
                    single && (
                      <DeathMap radar={single.radar} cells={single.cells} paint={continuousFreqPaint(single.cells, side)}
                        highlightKey={hovered} onHoverKey={setHovered} />
                    )
                  )}
                </div>
                {mode === "diff" ? <DiffKey /> : <GradientKey cells={single?.cells ?? []} side={side} />}
              </section>

              <aside className="an-side">
                {mode === "diff" ? (
                  <DiffTable groups={diffGroups} upload={upload.data!} reference={reference.data!} hovered={hovered} onHover={setHovered} />
                ) : (
                  <SingleSummary data={single!} hovered={hovered} onHover={setHovered} />
                )}
              </aside>
            </>
          )}
        </div>
      )}
      <PlayerBehaviorSection data={behaviorQ.data} loading={behaviorQ.isLoading} error={behaviorQ.error as Error | null} />
      </div>
    </div>
  );
}

function roleLabel(role: string): string {
  const names: Record<string, string> = {
    Entry: "Entry", Support: "Support", Lurker: "Lurker", Trader: "Trader",
    "Bomb carrier / Site executor": "Bomb carrier / Site executor",
    "Site Anchor": "Site Anchor", Rotator: "Rotator", "Aggressive Defender": "Aggressive Defender",
    "Retake Player": "Retake Player", "Hybrid / Unresolved": "Hybrid / Unresolved",
  };
  return names[role] ?? role;
}

export function PlayerBehaviorSection({ data, loading, error }: {
  data?: PlayerBehavior; loading: boolean; error: Error | null;
}) {
  const { t } = useT();
  const teams = data?.teams ?? [...new Set((data?.players ?? []).map((player) => player.team).filter((team): team is string => !!team))];
  const orderedTeams = data?.own_team && teams.includes(data.own_team)
    ? [data.own_team, ...teams.filter((team) => team !== data.own_team)]
    : teams;
  const teamGroups = orderedTeams.length > 0
    ? orderedTeams.map((team) => ({ team, profiles: (data?.players ?? []).filter((player) => player.team === team) }))
    : (["t", "ct"] as const).map((side) => ({ team: `${side.toUpperCase()} side`, profiles: (data?.players ?? []).filter((player) => player.side === side) }));
  return <section className="behavior" aria-labelledby="behavior-title" data-testid="player-behavior">
    <header className="behavior-head">
      <div className="behavior-title-icon" aria-hidden="true"><PlayerIcon /></div>
      <div>
        <h2 id="behavior-title">{t("รูปแบบการเล่นของผู้เล่น")}</h2>
      </div>
    </header>
    {loading && <p className="muted behavior-state" role="status">{t("กำลังคำนวณรูปแบบการเล่น…")}</p>}
    {error && <p className="err behavior-state" role="alert">{t("โหลดรูปแบบการเล่นไม่ได้: {msg}", { msg: error.message })}</p>}
    {!loading && !error && data && !data.available && <div className="behavior-state behavior-empty">
      <span aria-hidden="true"><DatabaseSearchIcon /></span><div><b>{t("ยังแสดงรูปแบบการเล่นไม่ได้")}</b><p className="muted">{t(`player_behavior_${data.reason ?? "unavailable"}`)}</p></div>
    </div>}
    {!loading && !error && data?.available && <>
      <div className="behavior-grid">
        {teamGroups.map((group) => <BehaviorTeam key={group.team} team={group.team}
          ours={data.own_team ? group.team === data.own_team : null} profiles={group.profiles} />)}
      </div>
    </>}
  </section>;
}

function BehaviorTeam({ team, ours, profiles }: {
  team: string; ours: boolean | null; profiles: PlayerBehaviorProfile[];
}) {
  const { t } = useT();
  const players = [...profiles.reduce((grouped, profile) => {
    const player = grouped.get(profile.steamid) ?? { steamid: profile.steamid, name: profile.name, profiles: [] as PlayerBehaviorProfile[] };
    player.profiles.push(profile);
    grouped.set(profile.steamid, player);
    return grouped;
  }, new Map<string, { steamid: string; name: string; profiles: PlayerBehaviorProfile[] }>()).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownershipClass = ours === null ? "" : ours ? " is-ours" : " is-opponent";
  return <div className={`behavior-side${ownershipClass}`}>
    <h3>{ours === null ? team : t(ours ? "ทีมเรา" : "ศัตรู")}</h3>
    {players.length === 0 ? <p className="muted">{t("ไม่มีผู้เล่นจากฝั่งนี้ในตัวกรอง")}</p> : players.map((player) =>
      <article className="behavior-card behavior-player-card" key={player.steamid}>
        <div className="behavior-player"><b title={player.name}>{player.name}</b></div>
        <div className="behavior-side-profiles">{player.profiles.sort((a, b) => a.side.localeCompare(b.side)).map((p) =>
          <section className={`behavior-side-profile side-${p.side}`} key={p.side} data-available={p.available}>
            <div className="behavior-profile-head"><span className={`badge b-${p.side}`}>{sideLabel(p.side)}</span><span className="muted">{t("{n} รอบ", { n: p.rounds })}</span></div>
            {!p.available ? <p className="muted">{t("ข้อมูลยังไม่พอ ต้องมีอย่างน้อย {n} รอบในฝั่งนี้", { n: p.minimum_rounds ?? 5 })}</p> : <>
              <strong className="behavior-role">{roleLabel(p.role ?? "Hybrid / Unresolved")}</strong>
              <p className="muted small">{t("สรุปจากรูปแบบใน {n} รอบ", { n: p.rounds })}</p>
            </>}
          </section>)}</div>
      </article>)}
  </div>;
}

// ================================================================================================
//
// ================================================================================================

// ================================================================================================
//
//
// ================================================================================================
const cellKey = (c: DeathCellCount) => c.place ?? `@${c.cx},${c.cy}`;

interface PlaceGroup<T extends DeathCellCount> {
  key: string;
  place: string | null;
  cells: T[];
  deaths: number;
  share: number;
}

function groupByPlace<T extends DeathCellCount>(cells: T[]): PlaceGroup<T>[] {
  const out = new Map<string, PlaceGroup<T>>();
  for (const c of cells) {
    const key = cellKey(c);
    let g = out.get(key);
    if (!g) {
      g = { key, place: c.place, cells: [], deaths: 0, share: 0 };
      out.set(key, g);
    }
    g.cells.push(c);
    g.deaths += c.deaths;
    g.share += c.share;
  }
  return [...out.values()];
}

/**
 */
function PlaceCell({ place, cells }: { place: string | null; cells: { cx: number; cy: number }[] }) {
  const { t } = useT();
  if (place) {
    return (
      <span className="an-place">
        {place}
        {cells.length > 1 && <span className="muted num"> · {t("{n} ช่อง", { n: cells.length })}</span>}
      </span>
    );
  }
  return (
    <span className="an-place">
      {t("ไม่มีชื่อเรียก")}
      <span className="muted num"> {cells[0].cx},{cells[0].cy}</span>
    </span>
  );
}

// ================================================================================================
// ================================================================================================
interface DiffRow extends DeathCellCount {
  shareRef: number;
  deathsRef: number;
  level: DiffLevel;
  ratio: number;
}

function compare(mine: DeathsOverlay, ref: DeathsOverlay): DiffRow[] {
  const refBy = new Map(ref.cells.map((c) => [`${c.cx},${c.cy}`, c]));
  return mine.cells
    .map((c) => {
      const r = refBy.get(`${c.cx},${c.cy}`);
      const shareRef = r?.share ?? 0;
      return {
        ...c,
        shareRef,
        deathsRef: r?.deaths ?? 0,
        level: diffLevel(c.share, shareRef, c.deaths),
        ratio: shareRef > 0 ? c.share / shareRef : Infinity,
      };
    })
    .sort((a, b) => b.level - a.level || b.deaths - a.deaths);
}

function groupDiffRows(rows: DiffRow[]) {
  return groupByPlace(rows).map((g) => {
    const shareRef = g.cells.reduce((s, c) => s + c.shareRef, 0);
    const deathsRef = g.cells.reduce((s, c) => s + c.deathsRef, 0);
    const ratio = shareRef > 0 ? g.share / shareRef : Infinity;
    return { ...g, shareRef, deathsRef, ratio, level: diffLevel(g.share, shareRef, g.deaths) };
  });
}

/**
 */
const diffPaint = (lv: DiffLevel) =>
  lv === 0 ? null : { fill: DIFF_FILL[String(lv) as "-2" | "-1" | "1" | "2"], opacity: 0 };

/**
 */
function zoneGeometry(cells: { x: number; y: number; w: number }[]) {
  const cx = cells.reduce((s, c) => s + c.x + c.w / 2, 0) / cells.length;
  const cy = cells.reduce((s, c) => s + c.y + c.w / 2, 0) / cells.length;
  const spread = Math.max(...cells.map((c) => Math.hypot(c.x + c.w / 2 - cx, c.y + c.w / 2 - cy)));
  const w = cells[0]?.w ?? 32;
  return { cx, cy, r: Math.max(w * 1.4, spread + w * 0.9) };
}

/**
 */
function ratioT(ratio: number, maxRatio: number): number {
  if (ratio < DIFF_STEPS.near) return 0;
  if (ratio === Infinity) return 1;
  const lo = Math.log(DIFF_STEPS.near);
  const hi = Math.log(Math.max(maxRatio, DIFF_STEPS.far));
  return Math.min(1, Math.max(0, (Math.log(ratio) - lo) / (hi - lo)));
}

/**
 */
function zoneRatioFill(groups: ReturnType<typeof groupDiffRows>) {
  const finite = groups.map((g) => g.ratio).filter((r) => Number.isFinite(r));
  const maxRatio = finite.length ? Math.max(DIFF_STEPS.far, ...finite) : DIFF_STEPS.far;
  return groups
    .filter((g) => g.place != null && g.deaths >= DIFF_MIN_DEATHS)
    .map((g) => {
      const t = ratioT(g.ratio, maxRatio);
      if (t <= 0) return null;
      const geo = zoneGeometry(g.cells);
      return { key: g.key, cx: geo.cx, cy: geo.cy, r: geo.r, fill: mixStops(RATIO_RAMP, t), opacity: 0.4 + t * 0.5 };
    })
    .filter((z): z is { key: string; cx: number; cy: number; r: number; fill: string; opacity: number } => z != null);
}

function DiffKey() {
  const { t } = useT();
  const gid = "diff-ratio-grad";
  return (
    <div className="map-key grad-key" aria-label={t("คำอธิบายสี")}>
      <span className="muted">{t("สีของแต่ละโซน = ทีมเราตายบ่อยกว่าทีมอาชีพกี่เท่า ยิ่งเข้มยิ่งต่างมาก")}</span>
      <span className="grad-bar-wrap">
        <span className="grad-num">{DIFF_STEPS.near}×</span>
        <svg className="grad-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              {RATIO_RAMP.map((c, i) => (
                <stop key={c} offset={`${(i / (RATIO_RAMP.length - 1)) * 100}%`} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="10" fill={`url(#${gid})`} />
        </svg>
        <span className="grad-num">{DIFF_STEPS.far}×+</span>
      </span>
      <span className="muted small key-adv">
        {t("ต่ำกว่า {near}× หรือทีมเราตายในโซนนั้นไม่ถึง {min} ครั้ง = ไม่ระบาย (ต่างกันไม่ชัดพอจะสรุปอะไรได้)",
          { near: DIFF_STEPS.near, min: DIFF_MIN_DEATHS })}
      </span>
    </div>
  );
}

interface TableHoverProps {
  hovered: string | null;
  onHover: (key: string | null) => void;
}

function DiffTable({ groups, upload, reference, hovered, onHover }:
  { groups: ReturnType<typeof groupDiffRows>; upload: DeathsOverlay; reference: DeathsOverlay } & TableHoverProps) {
  const worst = groups
    .filter((g) => g.level > 0)
    .sort((a, b) => b.level - a.level || b.deaths - a.deaths)
    .slice(0, 8);
  const { t } = useT();
  return (
    <>
      <h2>{t("จุดที่ทีมเราตายบ่อยกว่าทีมอาชีพ")}</h2>
      <p className="muted small">
        {t("{a} · ตาย {ad} ครั้ง เทียบกับ {b} · ตาย {bd} ครั้ง", {
          a: overlayLabel(upload, t), ad: upload.deaths, b: overlayLabel(reference, t), bd: reference.deaths,
        })}
      </p>
      {worst.length === 0 ? (
        <p className="muted small">
          {t("ข้อมูลยังไม่ถึงเกณฑ์ ต้องตายบ่อยกว่าทีมอาชีพอย่างน้อย {near}× และมีจำนวนครั้งเพียงพอ",
            { near: DIFF_STEPS.near })}
        </p>
      ) : (
        <table className="tbl compact an-tbl">
          <thead>
            <tr>
              <th>{t("ตรงไหนของแมพ")}</th>
              <th className="num">{t("เราตาย")}</th>
              <th className="num">{t("ของเรา")}</th>
              <th className="num">{t("ทีมอาชีพ")}</th>
              <th className="num">{t("ต่างกี่เท่า")}</th>
            </tr>
          </thead>
          <tbody>
            {worst.map((g) => (
              <tr key={g.key} className={hovered === g.key ? "hl" : ""} tabIndex={0}
                onMouseEnter={() => onHover(g.key)} onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(g.key)} onBlur={() => onHover(null)}>
                <td><PlaceCell place={g.place} cells={g.cells} /></td>
                <td className="num">{g.deaths}</td>
                <td className="num">{pct(g.share)}</td>
                <td className="num">{pct(g.shareRef)}</td>
                <td className="num"><b>{g.ratio === Infinity ? "—" : `${g.ratio.toFixed(1)}×`}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small an-note">
        {t("ตารางใช้สัดส่วนจุดตายของแต่ละชุดข้อมูล เพื่อชดเชยจำนวนแมตช์ที่ไม่เท่ากัน ทีมอาชีพมี 50 แมตช์")}
      </p>
    </>
  );
}

// ================================================================================================
//
// ================================================================================================
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const m = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

function mixStops(stops: readonly string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const seg = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  return mixHex(stops[i], stops[i + 1], seg - i);
}

/**
 */
function deathT(value: number, max: number): number {
  return max > 0 ? Math.log1p(value) / Math.log1p(max) : 0;
}

const MIN_PAINTED_DEATHS = 3;

function continuousFreqPaint(cells: DeathCellCount[], side: Side) {
  const max = Math.max(1, ...cells.map((c) => c.deaths));
  const ramp = DEATH_RAMP[side];
  return (c: DeathCellCount) => {
    if (c.deaths < MIN_PAINTED_DEATHS) return null;
    const t = deathT(c.deaths, max);
    return { fill: mixHex(ramp[0], ramp[ramp.length - 1], t), opacity: 0.5 + t * 0.42 };
  };
}

const SIDE_NOTE: Record<Side, string> = {
  all: "รวมทั้งสองฝั่ง",
  ct: "เฉพาะตอนเป็น CT",
  t: "เฉพาะตอนเป็น T",
};

/**
 */
function GradientKey({ cells, side }: { cells: DeathCellCount[]; side: Side }) {
  const { t } = useT();
  const max = Math.max(0, ...cells.map((c) => c.deaths));
  const ramp = DEATH_RAMP[side];
  if (max < MIN_PAINTED_DEATHS) {
    return (
      <p className="muted small key-adv" data-testid="grad-key-empty">
        {t("ยังไม่มีช่องไหนตายถึง {min} ครั้ง (ตายมากสุด {max} ครั้ง) — ข้อมูลน้อยเกินกว่าจะระบายแผนที่",
          { min: MIN_PAINTED_DEATHS, max })}
      </p>
    );
  }
  const gid = `death-grad-${side}`;
  const steps = 10;
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const value = MIN_PAINTED_DEATHS + ((max - MIN_PAINTED_DEATHS) * i) / steps;
    return { pos: (i / steps) * 100, color: mixHex(ramp[0], ramp[ramp.length - 1], deathT(value, max)) };
  });
  return (
    <div className="map-key grad-key" aria-label={t("คำอธิบายสี")}>
      <span className="muted">{t("จำนวนครั้งที่ตายในช่องนั้น ({note}) ยิ่งเข้มยิ่งตายบ่อย", { note: t(SIDE_NOTE[side]) })}</span>
      <span className="grad-bar-wrap">
        <span className="grad-num">{MIN_PAINTED_DEATHS}</span>
        <svg className="grad-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              {/* ไล่ตามเส้นโค้งเดียวกับที่ใช้ระบายแผนที่จริง (deathT) แถบสีจึงตรงกับสิ่งที่เห็นบนแผนที่เป๊ะ ๆ */}
              {stops.map((s) => (
                <stop key={s.pos} offset={`${s.pos}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="10" fill={`url(#${gid})`} />
        </svg>
        <span className="grad-num">{max}</span>
      </span>
      <span className="muted">{t("ครั้ง · ต่ำกว่า {min} ครั้งไม่ระบาย", { min: MIN_PAINTED_DEATHS })}</span>
    </div>
  );
}

function SingleSummary({ data, hovered, onHover }: { data: DeathsOverlay } & TableHoverProps) {
  const { t } = useT();
  const top = groupByPlace(data.cells).sort((a, b) => b.deaths - a.deaths).slice(0, 8);
  return (
    <section className="an-summary">
      <h2>{t("ช่องที่ตายบ่อยที่สุด")}</h2>
      <table className="tbl compact an-tbl">
        <thead>
          <tr>
            <th>{t("ตรงไหนของแมพ")}</th>
            <th className="num">{t("ตาย")}</th>
            <th className="num">{t("สัดส่วน")}</th>
          </tr>
        </thead>
        <tbody>
          {top.map((g) => (
            <tr key={g.key} className={hovered === g.key ? "hl" : ""} tabIndex={0}
              onMouseEnter={() => onHover(g.key)} onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(g.key)} onBlur={() => onHover(null)}>
              <td><PlaceCell place={g.place} cells={g.cells} /></td>
              <td className="num">{g.deaths}</td>
              <td className="num">{pct(g.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ================================================================================================
// ================================================================================================
interface MapProps<T extends DeathCellCount> {
  radar: DeathsOverlay["radar"];
  cells: T[];
  paint: (c: T) => { fill: string; opacity: number } | null;
  highlightKey?: string | null;
  onHoverKey?: (key: string | null) => void;
  radius?: number;
  blur?: number;
  layerOpacity?: number;
  /**
   */
  zoneFill?: { key: string; cx: number; cy: number; r: number; fill: string; opacity: number }[];
}

/**
 */
const MAJOR_ZONE_RE = /^(bombsite ?[ab]|mid(dle)?|t ?spawn|ct ?spawn)$/i;

/**
 */
function placeLabels<T extends DeathCellCount>(cells: T[]) {
  const out: { key: string; place: string; x: number; y: number }[] = [];
  for (const g of groupByPlace(cells)) {
    if (!g.place || !MAJOR_ZONE_RE.test(g.place)) continue;
    const x = g.cells.reduce((s, c) => s + c.x + c.w / 2, 0) / g.cells.length;
    const y = g.cells.reduce((s, c) => s + c.y + c.w / 2, 0) / g.cells.length;
    out.push({ key: g.key, place: g.place, x, y });
  }
  return out;
}

/**
 *
 */
function DeathMap<T extends DeathCellCount>({
  radar, cells, paint, highlightKey, onHoverKey, radius = 1, blur = 3.2, layerOpacity = 1, zoneFill,
}: MapProps<T>) {
  const { t } = useT();
  const s = radar.size;
  const labels = placeLabels(cells);
  const painted = cells
    .map((c) => ({ c, p: paint(c) }))
    .filter((x): x is { c: T; p: { fill: string; opacity: number } } => x.p != null)
    .sort((a, b) => a.p.opacity - b.p.opacity);
  const zonePainted = zoneFill && [...zoneFill].sort((a, b) => a.opacity - b.opacity);
  return (
    <svg viewBox={`0 0 ${s} ${s}`} className="radar" data-testid="analysis-radar">
      <defs>
        <filter id="cell-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>
      <image href={radar.image} x={0} y={0} width={s} height={s} />

      <g filter="url(#cell-blur)" opacity={layerOpacity} style={{ pointerEvents: "none" }}>
        {zonePainted
          ? zonePainted.map((z) => {
              const active = highlightKey != null && z.key === highlightKey;
              return (
                <circle
                  key={`zone-${z.key}`} cx={z.cx} cy={z.cy} r={z.r * radius}
                  fill={z.fill} opacity={active ? 1 : z.opacity} style={{ transition: "opacity .12s" }}
                />
              );
            })
          : painted.map(({ c, p }) => {
              const active = highlightKey != null && cellKey(c) === highlightKey;
              return (
                <circle
                  key={`fill-${c.cx}-${c.cy}`} cx={c.x + c.w / 2} cy={c.y + c.w / 2} r={c.w * 1.4 * radius}
                  fill={p.fill} opacity={active ? 1 : p.opacity} style={{ transition: "opacity .12s" }}
                />
              );
            })}
      </g>

      {painted.map(({ c }) => {
        const key = cellKey(c);
        const active = highlightKey != null && key === highlightKey;
        return (
          <rect
            key={`hit-${c.cx}-${c.cy}`} x={c.x} y={c.y} width={c.w} height={c.w}
            fill="transparent" stroke={active ? "#ffffff" : "transparent"} strokeWidth={active ? 2.5 : 0}
            onMouseEnter={() => onHoverKey?.(key)} onMouseLeave={() => onHoverKey?.(null)}
            data-testid="analysis-cell" data-active={active || undefined}
          >
            <title>{t("{place} (ช่อง {cx}, {cy}) · ตาย {d} ครั้ง",
              { place: c.place ?? t("ไม่มีชื่อเรียก"), cx: c.cx, cy: c.cy, d: c.deaths })}</title>
          </rect>
        );
      })}

      {labels.map((l) => (
        <text
          key={l.key} x={l.x} y={l.y} textAnchor="middle" className="zone-label"
          opacity={highlightKey == null || highlightKey === l.key ? 1 : 0.4}
        >
          {l.place}
        </text>
      ))}
    </svg>
  );
}

/**
 */
function overlayLabel(d: DeathsOverlay, t: TFn): string {
  const parts = [
    d.demo
      ? t("{demo} (1 แมตช์)", { demo: d.demo })
      : t(d.scope === "reference" ? "เดโมทีมอาชีพ {n} แมตช์" : "แมตช์ของทีม {n} แมตช์", { n: d.matches }),
  ];
  if (d.rounds?.length) parts.push(t("{n} รอบที่เลือก", { n: d.rounds.length }));
  if (d.players?.length) parts.push(t("{n} คนที่เลือก", { n: d.players.length }));
  return parts.join(" · ");
}


const matchLabel = (m: Match) => (m.team_a && m.team_b ? `${m.team_a} vs ${m.team_b}` : m.demo_file);
