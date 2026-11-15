import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ECharts } from "echarts";
import type { PlayerMatch } from "@/shared/api";
import { useT } from "@/shared/i18n";

export type FormMetric = "adr" | "kast" | "rating";
const METRICS: FormMetric[] = ["adr", "kast", "rating"];

function metricLabel(metric: FormMetric) {
  if (metric === "rating") return "Rating 1.0";
  return metric.toUpperCase();
}

function formatMetric(value: number | null, metric: FormMetric) {
  if (value == null) return "—";
  if (metric === "rating") return value.toFixed(2);
  if (metric === "kast") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}

function getMapNames(matches: PlayerMatch[]) {
  const mapNames = new Set<string>();
  for (const match of matches) {
    if (match.map_name) mapNames.add(match.map_name);
  }
  return [...mapNames].sort();
}

export function formSeries(matches: PlayerMatch[], metric: FormMetric) {
  const sortedMatches = [...matches];
  sortedMatches.sort((first, second) => {
    const timeDifference = Date.parse(first.imported_at) - Date.parse(second.imported_at);
    if (timeDifference) return timeDifference;
    return first.match_id - second.match_id;
  });

  return sortedMatches.map(match => {
    const value = match[metric];
    return { match, value: Number.isFinite(value) ? value : null };
  });
}

export function PlayerFormChart({ matches }: { matches: PlayerMatch[] }) {
  // 1. รับข้อมูล และจำสถิติกับแผนที่ที่ผู้ใช้เลือก
  const { t } = useT();
  const [selectedMetric, setSelectedMetric] = useState<FormMetric>("adr");
  const [selectedMap, setSelectedMap] = useState("all");
  const [chartStatus, setChartStatus] = useState<"loading" | "ready" | "error">("loading");
  const [announcement, setAnnouncement] = useState("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ECharts | null>(null);
  const selectedPointIndexRef = useRef(0);

  // 2. กรองและเรียงแมตช์เป็นจุดข้อมูล เก็บผลไว้จนกว่าข้อมูลหรือตัวเลือกจะเปลี่ยน
  const mapNames = getMapNames(matches);
  const points = useMemo(() => {
    const filteredMatches = matches.filter(match => {
      if (selectedMap === "all") return true;
      return match.map_name === selectedMap;
    });
    return formSeries(filteredMatches, selectedMetric);
  }, [matches, selectedMap, selectedMetric]);

  // 3. รอให้ React สร้างกล่อง แล้วสร้างกราฟในกล่องนั้น
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || points.length === 0) return;

    let cancelled = false;
    let chart: ECharts | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;

    async function createChart() {
      setChartStatus("loading");
      try {
        const echarts = await import("echarts");
        if (cancelled || !container) return;

        const chartInstance = echarts.init(container, undefined, { renderer: "canvas" });
        chart = chartInstance;
        chartInstanceRef.current = chartInstance;
        selectedPointIndexRef.current = points.length - 1;

        function drawChart() {
          const styles = getComputedStyle(document.documentElement);
          const color = (name: string) => styles.getPropertyValue(name).trim();
          const lineColor = color("--interactive");
          const textColor = color("--text");
          const mutedColor = color("--muted");
          const matchNumbers = points.map((_, index) => String(index + 1));
          const metricValues = points.map(point => point.value);

          // จุดที่สั่งให้ ECharts วาดแกน จุด และเส้นลงบน Canvas
          chartInstance.setOption({
            animation: false,
            aria: { enabled: true },
            textStyle: { fontFamily: "Anuphan, sans-serif", color: textColor },
            grid: { left: 50, right: 22, top: 20, bottom: 40 },
            xAxis: {
              type: "category",
              data: matchNumbers,
              boundaryGap: false,
              axisLabel: { color: mutedColor },
              axisLine: { lineStyle: { color: color("--line") } },
              axisTick: { show: false },
            },
            yAxis: {
              type: "value",
              min: 0,
              max: selectedMetric === "kast" ? 100 : null,
              axisLabel: {
                color: mutedColor,
                formatter(value: number) {
                  if (selectedMetric === "rating") return value.toFixed(1);
                  if (selectedMetric === "kast") return `${value}%`;
                  return String(value);
                },
              },
              splitLine: { lineStyle: { color: color("--line-2") } },
            },
            tooltip: {
              trigger: "axis",
              confine: true,
              backgroundColor: color("--card"),
              borderColor: color("--line"),
              textStyle: { color: textColor },
              formatter(params: { dataIndex: number }[]) {
                const pointIndex = params[0]?.dataIndex ?? 0;
                const point = points[pointIndex];
                if (!point) return "";

                const match = point.match;
                let resultText = t("เสมอ");
                if (match.result === "win") resultText = t("ชนะ");
                if (match.result === "loss") resultText = t("แพ้");

                const tooltip = document.createElement("div");
                tooltip.style.whiteSpace = "pre-line";
                tooltip.textContent = [
                  `${t("แมตช์ {n}", { n: pointIndex + 1 })} · ${match.map_name ?? "—"}`,
                  `${metricLabel(selectedMetric)}: ${formatMetric(point.value, selectedMetric)}`,
                  `${resultText} · ${match.kills} / ${match.deaths} / ${match.assists}`,
                ].join("\n");
                return tooltip;
              },
            },
            series: [{
              type: "line",
              name: metricLabel(selectedMetric),
              data: metricValues,
              connectNulls: false,
              symbol: "circle",
              symbolSize: 8,
              lineStyle: { color: lineColor, width: 2 },
              itemStyle: { color: lineColor },
            }],
          });
        }

        drawChart();

        themeObserver = new MutationObserver(drawChart);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });
        resizeObserver = new ResizeObserver(() => {
          chartInstance.dispatchAction({ type: "hideTip" });
          chartInstance.resize();
        });
        resizeObserver.observe(container);
        setChartStatus("ready");
      } catch {
        if (!cancelled) setChartStatus("error");
      }
    }

    void createChart();

    return () => {
      cancelled = true;
      themeObserver?.disconnect();
      resizeObserver?.disconnect();
      chart?.dispose();
      chartInstanceRef.current = null;
    };
  }, [points, selectedMetric, t]);

  // 4. ดูรายละเอียดแต่ละจุดด้วยคีย์บอร์ด โดยไม่ให้ตำแหน่งหลุดจากรายการ
  function inspectPoint(requestedIndex: number) {
    if (points.length === 0) return;

    let pointIndex = requestedIndex;
    if (pointIndex < 0) pointIndex = 0;
    if (pointIndex >= points.length) pointIndex = points.length - 1;

    selectedPointIndexRef.current = pointIndex;
    const point = points[pointIndex];
    chartInstanceRef.current?.dispatchAction({
      type: "showTip",
      seriesIndex: 0,
      dataIndex: pointIndex,
    });
    setAnnouncement(
      `${t("แมตช์ {n}", { n: pointIndex + 1 })} · ${point.match.map_name ?? "—"} · ${metricLabel(selectedMetric)} ${formatMetric(point.value, selectedMetric)}`
    );
  }

  function hideTooltip() {
    chartInstanceRef.current?.dispatchAction({ type: "hideTip" });
  }

  function handleChartKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextIndex = selectedPointIndexRef.current;
    switch (event.key) {
      case "Escape":
        hideTooltip();
        return;
      case "ArrowLeft":
        nextIndex -= 1;
        break;
      case "ArrowRight":
        nextIndex += 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = points.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    inspectPoint(nextIndex);
  }

  // 5. แสดงตัวเลือกและกล่องกราฟ ref นี้เชื่อมกล่องกับ useEffect ด้านบน
  return (
    <section className="profile-form" aria-labelledby="profile-form-heading">
      <div className="profile-form-head">
        <h2 id="profile-form-heading">{t("ฟอร์มย้อนหลัง")}</h2>
        <div className="profile-form-metrics" role="group" aria-label={t("สถิติในกราฟ")}>
          {METRICS.map(metric => (
            <button
              key={metric}
              type="button"
              aria-pressed={selectedMetric === metric}
              onClick={() => setSelectedMetric(metric)}
            >
              {metric === "rating" ? "Rating" : metric.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-compare-controls">
        <label>
          {t("แผนที่")}
          <select value={selectedMap} onChange={event => setSelectedMap(event.target.value)}>
            <option value="all">{t("ทุกแผนที่")}</option>
            {mapNames.map(mapName => (
              <option key={mapName} value={mapName}>{mapName}</option>
            ))}
          </select>
        </label>
      </div>

      {points.length === 0 ? (
        <p className="profile-empty-note">{t("ยังไม่มีแมตช์ในช่วงนี้")}</p>
      ) : (
        <>
          <div
            ref={chartContainerRef}
            className="profile-form-echart"
            data-testid="player-form-chart"
            role="img"
            tabIndex={0}
            aria-label={t("แนวโน้ม {metric} รายแมตช์", { metric: metricLabel(selectedMetric) })}
            aria-describedby="profile-chart-keys"
            onFocus={() => inspectPoint(points.length - 1)}
            onBlur={hideTooltip}
            onKeyDown={handleChartKeyDown}
          />
          <span id="profile-chart-keys" className="profile-chart-accessible">
            {t("ใช้ปุ่มลูกศรซ้ายและขวาเพื่อดูแต่ละแมตช์")}
          </span>
          <span className="profile-chart-accessible" aria-live="polite" aria-atomic="true">
            {announcement}
          </span>
          {chartStatus === "loading" && (
            <p className="profile-form-note" role="status">{t("กำลังโหลดกราฟ…")}</p>
          )}
          {chartStatus === "error" && (
            <p className="profile-form-note" role="alert">{t("โหลดกราฟไม่ได้ กรุณารีเฟรชหน้า")}</p>
          )}
        </>
      )}
    </section>
  );
}
