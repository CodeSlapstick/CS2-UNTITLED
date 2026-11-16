import { useEffect, useMemo, useRef, useState } from "react";
import type { ECharts } from "echarts";
import type { PlayerMatch } from "@/shared/api";
import { useT } from "@/shared/i18n";

// React สร้างปุ่ม ตัวเลือกแผนที่ และกล่องสำหรับใส่กราฟ
// ECharts รับข้อมูลแล้ววาดแกน จุด เส้น และกล่องรายละเอียดลงในกล่องนั้น
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
  // Set เก็บค่าไม่ซ้ำ
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
    // แปลงแต่ละแมตช์,value วาด,match สำหรับแสดงรายละเอียดชี้เมาส์
    const value = match[metric];
    return { match, value: Number.isFinite(value) ? value : null };
  });
}

export function PlayerFormChart({ matches }: { matches: PlayerMatch[] }) {
  const { t } = useT();
  // set ใช้เปลี่ยนค่าและให้ React อัปเดตหน้าจอ
  const [selectedMetric, setSelectedMetric] = useState<FormMetric>("adr");
  const [selectedMap, setSelectedMap] = useState("all");
  const [chartStatus, setChartStatus] = useState<"loading" | "ready" | "error">("loading");

  // กล่อง ที่จะวาดกราฟลงไป
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // เตรียมข้อมูล
  const mapNames = getMapNames(matches);
  const points = useMemo(() => { // เก็บผลที่คำนวณไว้ และใช้ผลเดิมซ้ำ ถ้าค่ายังไม่เปลี่ยน:
    // .filter() เลือกแมตช์ที่ตรงกับแผนที่
    const filteredMatches = matches.filter(match => {
      if (selectedMap === "all") return true;
      return match.map_name === selectedMap;
    });
    // เรียงแมตช์และเลือกค่าที่จะวาด:
    return formSeries(filteredMatches, selectedMetric);
    // เก็บ points เดิมไว้เมื่อข้อมูลและตัวเลือกไม่เปลี่ยน
  }, [matches, selectedMap, selectedMetric]);

  // สร้างและวาดกราฟ
  useEffect(() => {
    // หยิบกล่องกราฟที่ React เก็บไว้ มาใช้ในชื่อ container
    const container = chartContainerRef.current;
    // ถ้าไม่มีกล่องหรือข้อมูล หยุด
    if (!container || points.length === 0) return;

    // เตรียมไว้ตอนเริ่มสร้างกราฟ
    let cancelled = false;
    // เก็บกราฟที่สร้างเสร็จแล้ว
    let chart: ECharts | undefined;
    // เก็บตัวติดตามขนาดของกล่องกราฟ
    let resizeObserver: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;

    // สร้างกราฟ วาดลงกล่อง
    async function createChart() {
      setChartStatus("loading");
      try {
        // โหลด ECharts และรอให้เสร็จ
        const echarts = await import("echarts");
        if (cancelled || !container) return;

        // สร้างกราฟในกล่อง Canvas วาดภาพ
        const chartInstance = echarts.init(container, undefined, { renderer: "canvas" });
        chart = chartInstance;

        // สั่งวาดกราฟ
        function drawChart() {
          // สี
          const styles = getComputedStyle(document.documentElement);
          const color = (name: string) => styles.getPropertyValue(name).trim();
          const lineColor = color("--interactive");
          const textColor = color("--text");
          const mutedColor = color("--muted");
          // แกน X ใช้ลำดับแมตช์,ส่วนแกน Y ใช้ค่าจริง
          const matchNumbers = points.map((_, index) => String(index + 1));
          const metricValues = points.map(point => point.value);

          // ส่งข้อมูลและค่าตั้งให้ ECharts วาด
          chartInstance.setOption({
            animation: false,
            textStyle: { fontFamily: "Anuphan, sans-serif", color: textColor },
            // ขอบ
            grid: { left: 50, right: 22, top: 20, bottom: 40 },

            xAxis: {
              type: "category",
              data: matchNumbers,
              // ไม่เว้นช่องว่างหัว ท้าย
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

            // เมาส์ชี้จุด
            tooltip: {
              trigger: "axis",
              confine: true,
              backgroundColor: color("--card"),
              borderColor: color("--line"),
              textStyle: { color: textColor },
              // dataIndex บอกตำแหน่งจุดที่กำลังดู แล้วใช้ตำแหน่งนั้นหยิบข้อมูลจาก points
              formatter(params: { dataIndex: number }[]) {
                const pointIndex = params[0]?.dataIndex ?? 0;
                const point = points[pointIndex];
                if (!point) return "";

                // หยิบข้อมูลของแมตช์
                const match = point.match;
                let resultText = t("เสมอ");
                if (match.result === "win") resultText = t("ชนะ");
                if (match.result === "loss") resultText = t("แพ้");

                // textContent ใส่เป็นข้อความ ส่วน pre-line ทำให้ \n แสดงเป็นการขึ้นบรรทัดใหม่
                const tooltip = document.createElement("div");
                // ขึ้นบรรทัดแสดงในกล่อง
                tooltip.style.whiteSpace = "pre-line";
                tooltip.textContent = [
                  `${t("แมตช์ {n}", { n: pointIndex + 1 })} · ${match.map_name ?? "—"}`,
                  `${metricLabel(selectedMetric)}: ${formatMetric(point.value, selectedMetric)}`,
                  `${resultText} · ${match.kills} / ${match.deaths} / ${match.assists}`,
                ].join("\n");
                return tooltip;
              },
            },

            // ชุดข้อมูลหนึ่งเส้น: data คือค่าของแต่ละจุด ส่วนชื่อและสีใช้ตามสถิติ/ธีมที่เลือก
            series: [{
              type: "line",
              name: metricLabel(selectedMetric),
              data: metricValues,
              // มูลขาด เส้นขาด
              connectNulls: false,
              symbol: "circle",
              symbolSize: 8,
              lineStyle: { color: lineColor, width: 2 },
              itemStyle: { color: lineColor },
            }],
          });
        }

        // เรียกให้เริ่มวาดจริง หลังจากประกาศฟังก์ชันและสร้างตัวกราฟแล้ว
        drawChart();

        // หลังวาดเสร็จ โค้ดติดตามธีมและขนาดของกล่อง
        themeObserver = new MutationObserver(drawChart);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });

        // เมื่อกล่องเปลี่ยนขนาด ซ่อน tooltip และปรับกราฟตามกล่อง
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

    // ไม่เอาค่าที่ฟังก์ชันคืนกลับมาไปใช้ต่อ
    void createChart();

    // เมื่อเลิกใช้กราฟ จะล้างสิ่งที่สร้างไว้
    return () => {
      cancelled = true;
      themeObserver?.disconnect();
      resizeObserver?.disconnect();
      chart?.dispose();
    };
    // ทำ effect ใหม่เมื่อจุดข้อมูล สถิติ หรือฟังก์ชันแปลข้อความเปลี่ยน
  }, [points, selectedMetric, t]);

  // ปุ่ม ตัวเลือก กล่องกราฟ
  return (
    <section className="profile-form">
      <div className="profile-form-head">
        <h2>{t("ฟอร์มย้อนหลัง")}</h2>
        <div className="profile-form-metrics">
          {/* กดปุ่มแล้วเปลี่ยน selectedMetric ทำให้เตรียม points และสร้างกราฟตามสถิติใหม่ */}
          {METRICS.map(metric => (
            <button
              key={metric}
              type="button"
              data-active={selectedMetric === metric}
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
          {/* เปลี่ยนเฉพาะตัวกรองของกราฟ โดยใช้รายการแมตช์ที่รับมาแล้ว */}
          <select value={selectedMap} onChange={event => setSelectedMap(event.target.value)}>
            <option value="all">{t("ทุกแผนที่")}</option>
            {mapNames.map(mapName => (
              <option key={mapName} value={mapName}>{mapName}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ไม่มีจุดให้แสดง ให้ใช้ข้อความแทนกล่องกราฟ */}
      {points.length === 0 ? (
        <p className="profile-empty-note">{t("ยังไม่มีแมตช์ในช่วงนี้")}</p>
      ) : (
        <>
          {/* กล่องหน้าเว็บ */}
          <div
            ref={chartContainerRef}
            className="profile-form-echart"
            data-testid="player-form-chart"
          />

          {/* สถานะ ready ไม่แสดงข้อความรอ ส่วน loading และ error แสดงข้อความของตัวเอง */}
          {chartStatus === "loading" && (
            <p className="profile-form-note">{t("กำลังโหลดกราฟ…")}</p>
          )}
          {chartStatus === "error" && (
            <p className="profile-form-note">{t("โหลดกราฟไม่ได้ กรุณารีเฟรชหน้า")}</p>
          )}
        </>
      )}
    </section>
  );
}
