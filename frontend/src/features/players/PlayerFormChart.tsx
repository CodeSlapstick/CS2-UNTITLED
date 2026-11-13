import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerMatch } from "@/shared/api";
import { useT } from "@/shared/i18n";

export type FormMetric = "adr" | "kast" | "rating";
const METRICS: FormMetric[] = ["adr", "kast", "rating"];
const label = (key: FormMetric) => key === "rating" ? "Rating 1.0" : key.toUpperCase();
const format = (v: number | null, key: FormMetric) => v == null ? "—" : v.toFixed(key === "rating" ? 2 : 1) + (key === "kast" ? "%" : "");
export function formSeries(matches: PlayerMatch[], metric: FormMetric) {
  return [...matches].sort((a, b) => Date.parse(a.imported_at) - Date.parse(b.imported_at) || a.match_id - b.match_id)
    .map(match => ({ match, value: Number.isFinite(match[metric]) ? match[metric] : null }));
}

export function PlayerFormChart({ matches }: { matches: PlayerMatch[] }) {
  const { t } = useT();
  const [metric, setMetric] = useState<FormMetric>("adr");
  const [map, setMap] = useState("all");
  const root = useRef<HTMLDivElement>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);
  const selected = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  const [state, setState] = useState("loading");
  const maps = [...new Set(matches.map(m => m.map_name).filter((m): m is string => !!m))].sort();
  const filtered = useMemo(() => matches.filter(m => map === "all" || m.map_name === map), [matches, map]);
  const points = useMemo(() => formSeries(filtered, metric), [filtered, metric]);
  useEffect(() => {
    if (!root.current || !points.length) return;
    const node = root.current;
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    let resize: ResizeObserver | undefined, theme: MutationObserver | undefined;
    setState("loading");
    void import("echarts").then(ec => {
      if (disposed) return;
      chart = ec.init(node, undefined, { renderer: "canvas" });
      chartRef.current = chart;
      selected.current = points.length - 1;
      const paint = () => {
        const css = getComputedStyle(document.documentElement);
        const color = (key: string) => css.getPropertyValue(key).trim();
        const accent = color("--interactive"), text = color("--text"), muted = color("--muted");
        chart!.setOption({ animation: false, aria: { enabled: true }, textStyle: { fontFamily: "Anuphan, sans-serif", color: text },
          grid: { left: 50, right: 22, top: 20, bottom: 40 },
          xAxis: { type: "category", data: points.map((_, i) => String(i + 1)), boundaryGap: false, axisLabel: { color: muted }, axisLine: { lineStyle: { color: color("--line") } }, axisTick: { show: false } },
          yAxis: { type: "value", min: 0, max: metric === "kast" ? 100 : null,
            axisLabel: { color: muted, formatter: (v: number) => `${metric === "rating" ? v.toFixed(1) : v}${metric === "kast" ? "%" : ""}` }, splitLine: { lineStyle: { color: color("--line-2") } } },
          tooltip: { trigger: "axis", confine: true, backgroundColor: color("--card"), borderColor: color("--line"), textStyle: { color: text },
            formatter: (params: { dataIndex: number }[]) => {
              const index = params[0]?.dataIndex ?? 0, p = points[index];
              const element = document.createElement("div"); element.style.whiteSpace = "pre-line";
              element.textContent = `${t("แมตช์ {n}", { n: index + 1 })} · ${p.match.map_name ?? "—"}\n${label(metric)}: ${format(p.value, metric)}\n${t(p.match.result === "win" ? "ชนะ" : p.match.result === "loss" ? "แพ้" : "เสมอ")} · ${p.match.kills} / ${p.match.deaths} / ${p.match.assists}`;
              return element;
            } },
          series: [{ type: "line", name: label(metric), data: points.map(p => p.value), connectNulls: false, symbol: "circle", symbolSize: 8,
            lineStyle: { color: accent, width: 2 }, itemStyle: { color: accent } }],
        });
      };
      paint(); theme = new MutationObserver(paint); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      resize = new ResizeObserver(() => { chart?.dispatchAction({ type: "hideTip" }); chart?.resize(); }); resize.observe(node);
      setState("ready");
    }).catch(() => { if (!disposed) setState("error"); });
    return () => { disposed = true; theme?.disconnect(); resize?.disconnect(); chart?.dispose(); chartRef.current = null; };
  }, [points, metric, t]);
  const inspect = (index: number) => {
    selected.current = Math.max(0, Math.min(points.length - 1, index));
    const point = points[selected.current];
    if (!point) return;
    chartRef.current?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: selected.current });
    setAnnouncement(`${t("แมตช์ {n}", { n: selected.current + 1 })} · ${point.match.map_name ?? "—"} · ${label(metric)} ${format(point.value, metric)}`);
  };
  return <section className="profile-form" aria-labelledby="profile-form-heading">
    <div className="profile-form-head"><h2 id="profile-form-heading">{t("ฟอร์มย้อนหลัง")}</h2>
      <div className="profile-form-metrics" role="group" aria-label={t("สถิติในกราฟ")}>{METRICS.map(key => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{key === "rating" ? "Rating" : key.toUpperCase()}</button>)}</div>
    </div>
    <div className="profile-compare-controls">
      <label>{t("แผนที่")}<select value={map} onChange={e => setMap(e.target.value)}><option value="all">{t("ทุกแผนที่")}</option>{maps.map(m => <option key={m}>{m}</option>)}</select></label>
    </div>
    {!points.length ? <p className="profile-empty-note">{t("ยังไม่มีแมตช์ในช่วงนี้")}</p> : <>
      <div ref={root} className="profile-form-echart" data-testid="player-form-chart" role="img" tabIndex={0}
        aria-label={t("แนวโน้ม {metric} รายแมตช์", { metric: label(metric) })} aria-describedby="profile-chart-keys"
        onFocus={() => inspect(points.length - 1)} onBlur={() => chartRef.current?.dispatchAction({ type: "hideTip" })}
        onKeyDown={event => {
          if (event.key === "Escape") { chartRef.current?.dispatchAction({ type: "hideTip" }); return; }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          inspect(event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : selected.current + (event.key === "ArrowLeft" ? -1 : 1));
        }} />
      <span id="profile-chart-keys" className="profile-chart-accessible">{t("ใช้ปุ่มลูกศรซ้ายและขวาเพื่อดูแต่ละแมตช์")}</span>
      <span className="profile-chart-accessible" aria-live="polite" aria-atomic="true">{announcement}</span>
      {state === "loading" && <p className="profile-form-note" role="status">{t("กำลังโหลดกราฟ…")}</p>}
      {state === "error" && <p className="profile-form-note" role="alert">{t("โหลดกราฟไม่ได้ กรุณารีเฟรชหน้า")}</p>}
    </>}
  </section>;
}
