import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, matchesQuery, type MatchEconomy, type TeamBuy } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { Breadcrumb, endReasonLabel, MapThumb, MatchTabs, matchTitle, NotFound, num } from "@/shared/ui/utils";

// ================================================================================================
// ================================================================================================
/**
 *
 */
const BUY_LABEL: Record<TeamBuy, string> = {
  pistol: "ปืนสั้น",
  eco: "Eco",
  semi_eco: "Semi-eco",
  semi_buy: "Semi-buy",
  full: "Full buy",
};
const BUY_FILL: Record<TeamBuy, string> = {
  pistol: "#94a3b8", eco: "#d3ecd9", semi_eco: "#9fd4ac", semi_buy: "#4fa872", full: "#1f6b43",
};
const BUY_INK: Record<TeamBuy, string> = {
  pistol: "#1e293b", eco: "#14351f", semi_eco: "#14351f", semi_buy: "#ffffff", full: "#ffffff",
};
const BUY_RULE = "ทั้งทีมรวมกัน ≤ $5,000 = Eco · ≤ $10,000 = Semi-eco · ≤ $20,000 = Semi-buy · มากกว่านั้น = Full buy · รอบ 1 และ 13 = ปืนสั้นเสมอ";
const TEAM_COLOR = ["#b98300", "#6a55e0"];
const BUY_TYPES: TeamBuy[] = ["pistol", "eco", "semi_eco", "semi_buy", "full"];
type Side = "all" | "ct" | "t";

const money = (v: number | null | undefined) => (v == null ? "—" : `$${num(v)}`);

export function EconomyPage() {
  const { t } = useT();
  const [side, setSide] = useState<Side>("all");
  const { demo } = useParams();
  const matches = useQuery(matchesQuery);
  const entry = demo ? (matches.data ?? []).find((m) => m.demo_file === demo) : undefined;
  const q = useQuery({
    queryKey: ["economy", demo],
    queryFn: () => api.economy(demo!),
    enabled: !!entry && entry.status === "done",
    staleTime: 5 * 60_000,
  });

  if (matches.error) return <p className="err">{t("โหลดรายการแมตช์ไม่ได้: {msg}", { msg: (matches.error as Error).message })}</p>;
  if (!matches.data) return <p className="muted">{t("กำลังโหลด…")}</p>;
  if (!entry) return <NotFound title={t("ไม่พบแมตช์นี้")} detail={t("ไม่มีแมตช์ {demo} ในระบบ", { demo: demo ?? "" })} />;
  if (entry.status !== "done") return <Navigate to={`/matches/${encodeURIComponent(entry.demo_file)}`} replace />;

  const d = q.data;
  const ready = d && d.teams.length === 2 && d.rounds.length > 0;
  return (
    <div className="econ-page" data-testid="economy-page">
      <Breadcrumb items={[{ label: t("แมตช์"), to: "/matches" }, { label: matchTitle(entry) }]} />
      <div className="page-head mt-head">
        <MapThumb map={entry.map_name} className="mh-thumb" />
        <div>
          <h1>{matchTitle(entry)}</h1>
          <p className="muted small">{entry.map_name} · {t("{n} รอบ", { n: num(entry.rounds) })}</p>
        </div>
      </div>
      <MatchTabs demo={entry.demo_file} />

      {q.isLoading && <p className="muted">{t("กำลังโหลดเศรษฐกิจ…")}</p>}
      {q.error && <p className="err">{t("โหลดข้อมูลไม่ได้: {msg}", { msg: (q.error as Error).message })}</p>}
      {d && !ready && <p className="muted card">{t("แมตช์นี้ไม่มีข้อมูลมูลค่าอุปกรณ์รายรอบ (เดโมรุ่นเก่า) — โหลดเดโมซ้ำเพื่อคำนวณ")}</p>}
      {ready && (
        <>
          <div className="econ-report">
            <div className="econ-report-title">
              <strong>{matchTitle(entry)}</strong>
              <span>{entry.map_name ?? d.map ?? "—"} · {t("ผลการซื้อ: {side}", { side: side === "all" ? t("ทั้งสองฝั่ง") : side.toUpperCase() })}</span>
            </div>
            <div className="econ-teams" aria-label={t("สีของทีม")}>
              {d.teams.map((team, i) => (
                <span key={team}><i style={{ background: TEAM_COLOR[i] }} />{i === 0 ? t("{team} (เริ่มฝั่ง CT)", { team }) : t("{team} (เริ่มฝั่ง T)", { team })}</span>
              ))}
            </div>
            <OutcomeByBuy data={d} side={side} onSideChange={setSide} demo={entry.demo_file} />
            <section className="card">
              <EquipmentValueChart data={d} buyTypes={BUY_TYPES} demo={entry.demo_file} />
            </section>
            <section className="card">
              <div className="card-head">
                <h2>{t("ใครมีของมากกว่า")}</h2>
                <span className="muted small">{t("ส่วนต่างมูลค่าอุปกรณ์ · แท่งขึ้น = {a} มากกว่า · แท่งลง = {b} มากกว่า", { a: d.teams[0], b: d.teams[1] })}</span>
              </div>
              <AdvantageBars data={d} demo={entry.demo_file} />
            </section>
            <RoundBreakdown data={d} demo={entry.demo_file} />
          </div>
        </>
      )}
    </div>
  );
}


export function OutcomeByBuy({ data, side, onSideChange, demo }: { data: MatchEconomy; side: Side; onSideChange: (side: Side) => void; demo: string }) {
  const { t } = useT();
  const id = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section className="card" data-testid="econ-outcomes">
      <div className="card-head">
        <h2>{t("ซื้อแบบไหน ชนะกี่รอบ")}</h2>
        <div className="seg" role="group" aria-label={t("ฝั่ง")}>
          {(["all", "ct", "t"] as const).map((s) => (
            <button key={s} type="button" className={`seg-btn${side === s ? " on" : ""}`} aria-pressed={side === s}
              onClick={() => onSideChange(s)}>
              {t(s === "all" ? "ทั้งสองฝั่ง" : s === "ct" ? "ตอนเป็น CT" : "ตอนเป็น T")}
            </button>
          ))}
        </div>
      </div>
      <div className="econ-outcomes">
        {data.teams.map((team, i) => {
          const mine = data.rounds.filter((round) => round.teams[team] && (side === "all" || round.teams[team].side === side));
          return (
            <div key={team} className="eo-team">
              <h3><i style={{ background: TEAM_COLOR[i] }} />{team}</h3>
              <ul className="eo-rows">
                {data.buy_types.map((b) => {
                  const rs = mine.filter((round) => round.teams[team].buy_type === b);
                  const won = rs.filter((round) => round.teams[team].won).length;
                  const lost = rs.length - won;
                  const key = `${i}-${b}`;
                  return (
                    <li key={b} className={rs.length ? "" : "empty"}>
                      <button type="button" className="eo-row-button" aria-expanded={expanded === key}
                        aria-label={`${team} · ${t(BUY_LABEL[b])} · ${t("{n} รอบ", { n: rs.length })} · ${t("ชนะ {won} · แพ้ {lost}", { won, lost })}`}
                        aria-controls={`${id}-${key}-rounds`} aria-describedby={hovered === key ? `${id}-${key}-tip` : undefined}
                        onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(key)} onBlur={() => setHovered(null)}
                        onKeyDown={(event) => { if (event.key === "Escape") { setHovered(null); setExpanded(null); } }}
                        onClick={() => setExpanded((current) => current === key ? null : key)}>
                      <span className="eo-label"><i style={{ background: BUY_FILL[b] }} />{t(BUY_LABEL[b])}</span>
                      <b className="eo-pct">{rs.length ? `${Math.round((won / rs.length) * 100)}%` : "—"}</b>
                      <span className="eo-bar" aria-hidden="true">
                        {rs.length > 0 && (
                          <>
                            <i className="w" style={{ flexGrow: won }} />
                            <i className="l" style={{ flexGrow: lost }} />
                          </>
                        )}
                      </span>
                      <span className="eo-n small muted">
                        {rs.length ? t("ชนะ {won} · แพ้ {lost}", { won, lost }) : t("ไม่มีรอบแบบนี้")}
                      </span>
                      </button>
                      {hovered === key && <EconomyTooltip id={`${id}-${key}-tip`}>
                        <strong>{team} · {t(BUY_LABEL[b])}</strong>
                        <span>{t("{n} รอบ", { n: rs.length })} · {t("ชนะ {won} · แพ้ {lost}", { won, lost })}</span>
                        <span>{t("คลิกเพื่อดูรอบที่ซื้อแบบนี้")}</span>
                      </EconomyTooltip>}
                      {expanded === key && <div id={`${id}-${key}-rounds`} className="econ-buy-rounds">
                        <strong>{team} · {t(BUY_LABEL[b])} · {t("{n} รอบ", { n: rs.length })}</strong>
                        {rs.length ? <div className="econ-round-links">{rs.map((round) => <Link key={round.round_num}
                          to={`/matches/${encodeURIComponent(demo)}/rounds/${round.round_num}`}>
                          R{round.round_num} · {t(round.teams[team].won ? "ชนะ" : "แพ้")}
                        </Link>)}</div> : <span className="muted">{t("ไม่มีรอบแบบนี้")}</span>}
                      </div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="muted small econ-rule">{t(BUY_RULE)}</p>
    </section>
  );
}

function EconomyTooltip({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  return <div id={id} role="tooltip" className="econ-tooltip" style={style}>{children}</div>;
}

function RoundEconomyDetails({ data, round }: { data: MatchEconomy; round: MatchEconomy["rounds"][number] }) {
  const { t } = useT();
  const [a, b] = data.teams;
  const va = round.teams[a]?.equip;
  const vb = round.teams[b]?.equip;
  const difference = va != null && vb != null ? va - vb : null;
  return <>
    <strong>{t("รอบ")} {round.round_num}</strong>
    {data.teams.map((team, index) => {
      const entry = round.teams[team];
      return <span className="econ-tooltip-team" key={team}><i style={{ background: TEAM_COLOR[index] }} />
        <b>{team}</b><span>{money(entry?.equip)}</span>
        <small>{entry?.buy_type ? t(BUY_LABEL[entry.buy_type]) : "—"}{entry?.side ? ` · ${entry.side.toUpperCase()}` : ""}</small>
      </span>;
    })}
    {difference != null && <span>{difference === 0 ? t("มูลค่าอุปกรณ์เท่ากัน")
      : t("{team} มากกว่า {v}", { team: difference > 0 ? a : b, v: money(Math.abs(difference)) })}</span>}
    <span>{t("ผู้ชนะ")}: {round.winner_team ?? "—"} · {endReasonLabel(round.end_reason)}</span>
    <small>{t("คลิกเพื่อดูรอบนี้")}</small>
  </>;
}

function useWidth<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PAD = { l: 58, r: 14, t: 12, b: 46 };
const niceMax = (v: number) => Math.max(10000, Math.ceil(v / 10000) * 10000);
const kFmt = (v: number) => (v === 0 ? "0" : `${v / 1000}K`);

function xScale(n: number, w: number) {
  const inner = w - PAD.l - PAD.r;
  return (i: number) => PAD.l + (n <= 1 ? inner / 2 : (i * inner) / (n - 1));
}
const tickEvery = (n: number, w: number) => Math.max(1, Math.ceil((n * 22) / Math.max(1, w - PAD.l - PAD.r)));
const halfIndex = (data: MatchEconomy) => data.rounds.findIndex((r) => r.round_num === 13);

function EquipmentValueChart({ data, buyTypes, demo }: { data: MatchEconomy; buyTypes: TeamBuy[]; demo: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useT();
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    let observer: ResizeObserver | null = null;
    void import("echarts").then((echarts) => {
      if (disposed || !rootRef.current) return;
      chart = echarts.init(rootRef.current, undefined, { renderer: "canvas" });
      const styles = getComputedStyle(document.documentElement);
      const text = styles.getPropertyValue("--text").trim() || "#17202c";
      const muted = styles.getPropertyValue("--muted").trim() || "#596575";
      const line = styles.getPropertyValue("--line").trim() || "#c9d1dc";
      const card = styles.getPropertyValue("--card").trim() || "#fff";
      const rounds = data.rounds.map((round) => String(round.round_num));
      chart.setOption({
        animationDuration: 280,
        color: TEAM_COLOR,
        textStyle: { color: text, fontFamily: "Anuphan, sans-serif" },
        legend: { top: 0, data: data.teams, textStyle: { color: text }, selectedMode: true },
        grid: { left: 68, right: 24, top: 50, bottom: 48, containLabel: false },
        xAxis: { type: "category", name: t("รอบ"), nameLocation: "middle", nameGap: 30, data: rounds, axisLine: { lineStyle: { color: line } }, axisLabel: { color: muted }, axisPointer: { show: true, type: "line", lineStyle: { color: muted, type: "dashed" } } },
        yAxis: { type: "value", name: t("มูลค่าอุปกรณ์ ($)"), nameGap: 44, nameLocation: "middle", axisLabel: { color: muted, formatter: (value: number) => `$${value / 1000}k` }, splitLine: { lineStyle: { color: line, opacity: .65 } } },
        tooltip: {
          trigger: "axis",
          confine: true,
          axisPointer: { type: "line" },
          backgroundColor: card,
          borderColor: line,
          textStyle: { color: text },
          formatter: (params: Array<{ dataIndex: number; marker: string; seriesName: string; value: number | null }>) => {
            const index = params[0]?.dataIndex ?? 0;
            const round = data.rounds[index];
            const values = params.filter((item) => item.value != null).map((item) => `${item.marker}${item.seriesName}: <b>${money(item.value)}</b>`).join("<br/>");
            const winner = round?.winner_team ? `<br/>${t("ผู้ชนะ")}: <b>${round.winner_team}</b>` : "";
            return `<b>${t("รอบ")} ${round?.round_num ?? "—"}</b><br/>${values || t("ไม่มีข้อมูลมูลค่าอุปกรณ์")}${winner}`;
          },
        },
        series: data.teams.map((team, teamIndex) => ({
          name: team,
          type: "line",
          connectNulls: false,
          symbol: "circle",
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { width: 3, color: TEAM_COLOR[teamIndex] },
          itemStyle: { color: TEAM_COLOR[teamIndex], borderColor: card, borderWidth: 2 },
          emphasis: { focus: "series", scale: 1.35 },
          data: data.rounds.map((round) => {
            const teamRound = round.teams[team];
            return teamRound?.buy_type && buyTypes.includes(teamRound.buy_type) ? teamRound.equip : null;
          }),
        })),
      });
      chart.on("click", (event: { dataIndex?: number }) => {
        const round = event.dataIndex == null ? null : data.rounds[event.dataIndex];
        if (round) navigate(`/matches/${encodeURIComponent(demo)}/rounds/${round.round_num}`);
      });
      observer = new ResizeObserver(() => {
        chart?.dispatchAction({ type: "hideTip" });
        chart?.resize();
      });
      observer.observe(root);
    });
    return () => { disposed = true; observer?.disconnect(); chart?.dispose(); };
  }, [buyTypes, data, demo, navigate, t]);
  return <div ref={rootRef} className="econ-echart" role="img" aria-label={t("กราฟมูลค่าอุปกรณ์ทั้งทีมรายรอบ คลิกจุดเพื่อเปิด Demo Viewer")} />;
}

export function EquipLines({ data }: { data: MatchEconomy }) {
  const { t } = useT();
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 280;
  const n = data.rounds.length;
  const vals = data.teams.map((tm) => data.rounds.map((r) => r.teams[tm]?.equip ?? null));
  const max = niceMax(Math.max(...vals.flat().map((v) => v ?? 0)));
  const x = xScale(n, w);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b - 16);
  const base = y(0);
  const every = tickEvery(n, w);
  const half = halfIndex(data);
  return (
    <div ref={ref} className="econ-chart">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={t("กราฟมูลค่าอุปกรณ์ทั้งทีมรายรอบ")}>
          {Array.from({ length: max / 10000 + 1 }, (_, k) => k * 10000).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} className="gl" />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="ax">{kFmt(v)}</text>
            </g>
          ))}
          {half > 0 && <line x1={(x(half - 1) + x(half)) / 2} x2={(x(half - 1) + x(half)) / 2} y1={PAD.t} y2={base} className="half" />}
          {vals.map((vs, ti) => (
            <g key={ti}>
              <polyline fill="none" stroke={TEAM_COLOR[ti]} strokeWidth={2.5} strokeLinejoin="round"
                points={vs.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ")} />
              {vs.map((v, i) => v != null && (
                <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="#fff" stroke={TEAM_COLOR[ti]} strokeWidth={2}>
                  <title>{t("รอบ {n} · {team} {v}", { n: data.rounds[i].round_num, team: data.teams[ti], v: money(v) })}</title>
                </circle>
              ))}
            </g>
          ))}
          {/* แถบผู้ชนะใต้แกน — สีของทีมที่ชนะรอบนั้น */}
          {data.rounds.map((r, i) => {
            const ti = r.winner_team ? data.teams.indexOf(r.winner_team) : -1;
            const bw = Math.max(4, Math.min(14, (w - PAD.l - PAD.r) / n - 3));
            return (
              <g key={r.round_num}>
                <rect x={x(i) - bw / 2} y={base + 6} width={bw} height={6} rx={1.5}
                  fill={ti >= 0 ? TEAM_COLOR[ti] : "#cbd5e1"}>
                  <title>{t("รอบ {n} · {team} ชนะ · {reason}", { n: r.round_num, team: r.winner_team ?? "?", reason: endReasonLabel(r.end_reason) })}</title>
                </rect>
                {(i % every === 0 || i === n - 1) && (
                  <text x={x(i)} y={base + 28} textAnchor="middle" className="ax">{r.round_num}</text>
                )}
              </g>
            );
          })}
          <text x={PAD.l} y={H - 4} className="ax">{t("รอบ")}</text>
        </svg>
      )}
    </div>
  );
}

export function AdvantageBars({ data, demo }: { data: MatchEconomy; demo: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 240;
  const [a, b] = data.teams;
  const diffs = data.rounds.map((r) => {
    const va = r.teams[a]?.equip;
    const vb = r.teams[b]?.equip;
    return va == null || vb == null ? null : va - vb;
  });
  const lim = niceMax(Math.max(...diffs.map((v) => Math.abs(v ?? 0))));
  const n = data.rounds.length;
  const inner = w - PAD.l - PAD.r;
  const slot = inner / Math.max(1, n);
  const cx = (i: number) => PAD.l + slot * (i + 0.5);
  const y = (v: number) => PAD.t + ((lim - v) / (2 * lim)) * (H - PAD.t - PAD.b);
  const every = tickEvery(n, w);
  const half = halfIndex(data);
  const steps = [-lim, -lim / 2, 0, lim / 2, lim];
  return (
    <div ref={ref} className="econ-chart econ-interactive-chart" onMouseLeave={() => setActive(null)}>
      {w > 0 && (
        <svg width={w} height={H} role="group" aria-label={t("กราฟส่วนต่างมูลค่าอุปกรณ์รายรอบ")}>
          {steps.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? "zero" : "gl"} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="ax">
                {v === 0 ? "0" : `${v > 0 ? "+" : "−"}${kFmt(Math.abs(v))}`}
              </text>
            </g>
          ))}
          {half > 0 && <line x1={PAD.l + slot * half} x2={PAD.l + slot * half} y1={PAD.t} y2={H - PAD.b} className="half" />}
          {diffs.map((v, i) => {
            const bw = Math.max(3, slot * 0.62);
            const top = Math.min(y(v ?? 0), y(0));
            const open = () => navigate(`/matches/${encodeURIComponent(demo)}/rounds/${data.rounds[i].round_num}`);
            return (
              <g key={data.rounds[i].round_num} role="link" tabIndex={0} className="econ-round-hit"
                aria-label={t("เปิดรอบ {n}", { n: data.rounds[i].round_num })}
                aria-describedby={active === i ? id : undefined}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                onClick={open} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
                  if (event.key === "Escape") setActive(null);
                }}>
                {active === i && <line x1={cx(i)} x2={cx(i)} y1={PAD.t} y2={H - PAD.b} className="econ-crosshair" />}
                {v != null && <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(2, Math.abs(y(v) - y(0)))} rx={2}
                  fill={v === 0 ? "var(--muted)" : TEAM_COLOR[v > 0 ? 0 : 1]} opacity={active != null && active !== i ? .65 : 1} />}
                <rect className="econ-hit-target" x={PAD.l + slot * i} y={PAD.t} width={Math.max(1, slot)} height={H - PAD.t - PAD.b} fill="transparent" />
              </g>
            );
          })}
          {data.rounds.map((r, i) => (i % every === 0 || i === n - 1) && (
            <text key={r.round_num} x={cx(i)} y={H - PAD.b + 18} textAnchor="middle" className="ax">{r.round_num}</text>
          ))}
          <text x={PAD.l} y={H - 4} className="ax">{t("รอบ")}</text>
        </svg>
      )}
      {active != null && data.rounds[active] && <EconomyTooltip id={id}
        style={{ top: 8, bottom: "auto", left: Math.max(0, Math.min(w - Math.min(300, w), cx(active) - 150)) }}>
        <RoundEconomyDetails data={data} round={data.rounds[active]} />
      </EconomyTooltip>}
    </div>
  );
}

export function RoundBreakdown({ data, demo }: { data: MatchEconomy; demo: string }) {
  const { t } = useT();
  const id = useId();
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);
  const [hoveredBuy, setHoveredBuy] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ team: string; buy: TeamBuy } | null>(null);
  const [a, b] = data.teams;
  const max = Math.max(1, ...data.rounds.flatMap((r) => [r.teams[a]?.equip ?? 0, r.teams[b]?.equip ?? 0]));
  const share = (team: string) => {
    const rs = data.rounds.map((r) => r.teams[team]?.buy_type).filter(Boolean);
    return data.buy_types.map((bt) => ({ bt, count: rs.filter((x) => x === bt).length,
      pct: rs.length ? Math.round((rs.filter((x) => x === bt).length / rs.length) * 100) : 0 }));
  };
  const rounds = filter ? data.rounds.filter((round) => round.teams[filter.team]?.buy_type === filter.buy) : data.rounds;
  return (
    <section className="card" data-testid="econ-breakdown">
      <div className="card-head">
        <h2>{t("รายรอบ")}</h2>
        <span className="muted small">{t("สีแท่ง = ประเภทการซื้อ · ● = ทีมที่ชนะรอบนั้น")}</span>
      </div>
      <div className="rb-share">
        {[a, b].map((team, i) => (
          <div key={team} className="rb-share-team">
            <h3><i style={{ background: TEAM_COLOR[i] }} />{team}</h3>
            <ul>
              {share(team).map(({ bt, pct, count }) => {
                const key = `${i}-${bt}`;
                return <li key={bt}><button type="button" className="rb-share-button"
                  aria-label={`${team} · ${t(BUY_LABEL[bt])} · ${pct}%`}
                  aria-pressed={filter?.team === team && filter.buy === bt}
                  aria-describedby={hoveredBuy === key ? `${id}-buy` : undefined}
                  onMouseEnter={() => setHoveredBuy(key)} onMouseLeave={() => setHoveredBuy(null)}
                  onFocus={() => setHoveredBuy(key)} onBlur={() => setHoveredBuy(null)}
                  onKeyDown={(event) => { if (event.key === "Escape") setHoveredBuy(null); }}
                  onClick={() => { setHoveredBuy(null); setFilter((current) => current?.team === team && current.buy === bt ? null : { team, buy: bt }); }}>
                  <i style={{ background: BUY_FILL[bt] }} /><b>{pct}%</b><span>{t(BUY_LABEL[bt])}</span>
                </button>
                  {hoveredBuy === key && <EconomyTooltip id={`${id}-buy`}><strong>{team} · {t(BUY_LABEL[bt])}</strong>
                    <span>{t("{n} รอบ", { n: count })} · {pct}%</span><small>{t("คลิกเพื่อกรองรายการรอบ")}</small></EconomyTooltip>}
                </li>;
              })}
            </ul>
          </div>
        ))}
      </div>
      {filter && <div className="econ-active-filter" role="status">
        <span>{filter.team} · {t(BUY_LABEL[filter.buy])} · {t("{n} รอบ", { n: rounds.length })}</span>
        <button type="button" className="btn-ghost" onClick={() => setFilter(null)}>{t("แสดงทุกรอบ")}</button>
      </div>}
      <ol className="rb-rows">
        {rounds.map((r) => (
          <li key={r.round_num} className={r.round_num === 13 ? "after-half" : ""}>
            <Link className="rb-round-link" to={`/matches/${encodeURIComponent(demo)}/rounds/${r.round_num}`}
              aria-label={t("เปิดรอบ {n}", { n: r.round_num })} aria-describedby={hoveredRound === r.round_num ? `${id}-round` : undefined}
              onMouseEnter={() => setHoveredRound(r.round_num)} onMouseLeave={() => setHoveredRound(null)}
              onFocus={() => setHoveredRound(r.round_num)} onBlur={() => setHoveredRound(null)}
              onKeyDown={(event) => { if (event.key === "Escape") setHoveredRound(null); }}>
            <RoundEquipmentBar team={a} round={r} dir="l" max={max} />
            <span className="rb-mid">
              <i className={r.winner_team === a ? "on" : ""} style={{ background: r.winner_team === a ? TEAM_COLOR[0] : undefined }} />
              <b>{r.round_num}</b>
              <i className={r.winner_team === b ? "on" : ""} style={{ background: r.winner_team === b ? TEAM_COLOR[1] : undefined }} />
            </span>
            <RoundEquipmentBar team={b} round={r} dir="r" max={max} />
            </Link>
            {hoveredRound === r.round_num && <EconomyTooltip id={`${id}-round`} style={{ left: "50%", transform: "translateX(-50%)" }}>
              <RoundEconomyDetails data={data} round={r} />
            </EconomyTooltip>}
          </li>
        ))}
      </ol>
      {!rounds.length && <p className="muted">{t("ไม่มีรอบแบบนี้")}</p>}
      <ul className="rb-legend small">
        {data.buy_types.map((bt) => <li key={bt}><i style={{ background: BUY_FILL[bt] }} />{t(BUY_LABEL[bt])}</li>)}
      </ul>
    </section>
  );
}

function RoundEquipmentBar({ team, round, dir, max }: {
  team: string; round: MatchEconomy["rounds"][number]; dir: "l" | "r"; max: number;
}) {
  const entry = round.teams[team];
  if (!entry || entry.equip == null || !entry.buy_type) return <span className="rb-bar-wrap" />;
  return <span className={`rb-bar-wrap ${dir}`}><span className="rb-bar"
    style={{ width: `${Math.max(8, (entry.equip / max) * 100)}%`, background: BUY_FILL[entry.buy_type], color: BUY_INK[entry.buy_type] }}>
    {money(entry.equip)}
  </span></span>;
}
