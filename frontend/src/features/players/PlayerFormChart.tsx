import { useEffect, useMemo, useRef, useState } from "react";
import type { ECharts } from "echarts";
import type { PlayerMatch } from "@/shared/api";
import { useT } from "@/shared/i18n";

// React ดูแลปุ่มและกล่อง ส่วน ECharts คำนวณตำแหน่งแล้ววาดแกน จุด และเส้นลงบน Canvas
// useState จำค่าที่มีผลต่อหน้าจอ, useMemo เก็บผลคำนวณ, useRef เก็บสิ่งที่ต้องอ้างถึง, useEffect จัดการกราฟหลังสร้างกล่อง
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
  // sort เปลี่ยนลำดับ array ที่ใช้คัดลอกก่อนไม่เปลี่ยนต้น
  const sortedMatches = [...matches];
  sortedMatches.sort((first, second) => {
    const timeDifference = Date.parse(first.imported_at) - Date.parse(second.imported_at);
    if (timeDifference) return timeDifference;
    return first.match_id - second.match_id;
  });

  return sortedMatches.map(match => {
    // เลือกค่าสถิติ,value ใช้วาดตำแหน่งจุด,match ใช้แสดงข้อมูลเพิ่มเติม
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
    // เรียงแมตช์
    return formSeries(filteredMatches, selectedMetric);
    // เก็บ points เดิมไว้เมื่อข้อมูลและตัวเลือกไม่เปลี่ยน
  }, [matches, selectedMap, selectedMetric]);

  // สร้างและวาดกราฟ
  useEffect(() => {
    // ค่าของ Ref อ่านและเปลี่ยนผ่าน .current
    const container = chartContainerRef.current;
    // ถ้าไม่มีกล่องหรือข้อมูล หยุด
    if (!container || points.length === 0) return;

    // ป้องกันการสร้างกราฟต่อ หากผู้ใช้ออกจากส่วนนี้ระหว่างรอโหลด ECharts
    let cancelled = false;
    // เก็บกราฟของ effect รอบนี้ เพื่อให้ฟังก์ชัน cleanup ด้านล่างล้างกราฟได้
    let chart: ECharts | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;

    async function createChart() {
      setChartStatus("loading");
      try {
        // โหลดไลบรารีเมื่อจะใช้จริง และ await รอให้โหลดเสร็จก่อนทำบรรทัดถัดไป
        const echarts = await import("echarts");
        if (cancelled || !container) return;

        // init สร้างกราฟใน container; undefined คือไม่ระบุธีมสำเร็จรูป; Canvas คือพื้นที่วาดภาพบนเว็บ
        const chartInstance = echarts.init(container, undefined, { renderer: "canvas" });
        // เก็บตัวกราฟไว้ให้ cleanup ล้างเมื่อเลิกใช้งาน
        chart = chartInstance;

        // ประกาศวิธีวาดไว้ก่อน ยังไม่ทำงานจนกว่าจะเรียก drawChart() ด้านล่าง
        function drawChart() {
          // อ่านสีจาก CSS ของเว็บ เพื่อให้เส้น ตัวหนังสือ และพื้นหลังตรงกับธีมปัจจุบัน
          const styles = getComputedStyle(document.documentElement);
          const color = (name: string) => styles.getPropertyValue(name).trim();
          const lineColor = color("--interactive");
          const textColor = color("--text");
          const mutedColor = color("--muted");
          // แกน X ใช้ลำดับแมตช์ ["1", "2", "3"] ส่วนแกน Y ใช้ค่าจริง เช่น [70, 85, 60]
          const matchNumbers = points.map((_, index) => String(index + 1));
          const metricValues = points.map(point => point.value);

          // จุดที่สั่งให้ ECharts วาดแกน จุด และเส้นลงบน Canvas
          // เราส่งข้อมูลกับค่าตั้ง ส่วน ECharts จัดสเกลและคำนวณพิกัดให้
          chartInstance.setOption({
            animation: false,
            textStyle: { fontFamily: "Anuphan, sans-serif", color: textColor },
            // เว้นพื้นที่ขอบสำหรับข้อความและตัวเลขของแกน
            grid: { left: 50, right: 22, top: 20, bottom: 40 },
            // แกนนอนเป็นหมวดหมู่ตามลำดับแมตช์ โดยแต่ละแมตช์ห่างเท่ากัน
            xAxis: {
              type: "category",
              data: matchNumbers,
              boundaryGap: false,
              axisLabel: { color: mutedColor },
              axisLine: { lineStyle: { color: color("--line") } },
              axisTick: { show: false },
            },
            // แกนตั้งเป็นตัวเลข เริ่มที่ 0; KAST จำกัดที่ 100 ส่วนค่าอื่นให้กำหนดขอบบนอัตโนมัติ
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
            // กล่องรายละเอียดเมื่อใช้เมาส์ชี้จุดบนกราฟ
            tooltip: {
              trigger: "axis",
              confine: true,
              backgroundColor: color("--card"),
              borderColor: color("--line"),
              textStyle: { color: textColor },
              formatter(params: { dataIndex: number }[]) {
                // dataIndex บอกตำแหน่งจุดที่กำลังดู แล้วใช้ตำแหน่งนั้นหยิบข้อมูลจาก points
                const pointIndex = params[0]?.dataIndex ?? 0;
                const point = points[pointIndex];
                if (!point) return "";

                const match = point.match;
                let resultText = t("เสมอ");
                if (match.result === "win") resultText = t("ชนะ");
                if (match.result === "loss") resultText = t("แพ้");

                // textContent ใส่เป็นข้อความ ส่วน pre-line ทำให้ \n แสดงเป็นการขึ้นบรรทัดใหม่
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
            // ชุดข้อมูลหนึ่งเส้น: data คือค่าของแต่ละจุด ส่วนชื่อและสีใช้ตามสถิติ/ธีมที่เลือก
            series: [{
              type: "line",
              name: metricLabel(selectedMetric),
              data: metricValues,
              // เมื่อเจอ null ให้เว้นเส้น เพื่อแยกไม่มีข้อมูลออกจากค่าศูนย์
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

        // เมื่อ data-theme ของ <html> เปลี่ยน ให้อ่านสีใหม่และวาดด้วยค่าตั้งใหม่
        themeObserver = new MutationObserver(drawChart);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });
        // เมื่อกล่องกราฟเปลี่ยนขนาด เช่น ย่อหน้าต่าง ให้ซ่อน tooltip และปรับกราฟตามกล่อง
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

    // เรียกสร้างกราฟ; void หมายถึงไม่เอาค่าที่ฟังก์ชันส่งกลับมาไปใช้ต่อ
    void createChart();

    // React เรียก cleanup ตอนออกจาก component หรือก่อน effect รอบใหม่ เพื่อไม่ทิ้งกราฟ/ตัวติดตามเก่าไว้
    return () => {
      cancelled = true;
      themeObserver?.disconnect();
      resizeObserver?.disconnect();
      chart?.dispose();
    };
    // ทำ effect ใหม่เมื่อจุดข้อมูล สถิติ หรือฟังก์ชันแปลข้อความเปลี่ยน
  }, [points, selectedMetric, t]);

  // แสดงตัวเลือกและกล่องกราฟ ref นี้เชื่อมกล่องกับ useEffect ด้านบน
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
          {/* React สร้างกล่องนี้ แล้ว ref จะเก็บกล่องไว้ใน chartContainerRef.current ให้ useEffect ใช้ */}
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
