import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, matchesQuery, type Side } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { AnalysisReportExport } from "@/features/analysis/AnalysisReportExport";
import "./coach.css";

const REASONS: Record<string, string> = {
  model_unavailable: "ยังไม่มีข้อมูลเพียงพอสำหรับแนะนำแผนบนแมพนี้",
  unsupported_map: "ยังแนะนำแผนสำหรับแมพนี้ไม่ได้",
  missing_economy: "รอบนี้ไม่มีข้อมูลอุปกรณ์ก่อนเริ่มรอบครบ 5 คน จึงยังแนะนำแผนไม่ได้",
  training_match: "เลือกแมตช์ที่ทีมอัปโหลดเพื่อดูแผนที่เหมาะกับรอบของทีม",
  insufficient_support: "ยังมีตัวอย่างรอบลักษณะนี้ไม่พอสำหรับแนะนำแผน",
};

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function planLabel(name: string, t: TFn): string {
  const label = name.replace(/\s*·\s*P\d+\s*$/, "").trim();
  if (label === "Default spread") return t("กระจายผู้เล่นคุมพื้นที่");
  if (label === "Balanced hold") return t("กระจายกำลังตั้งรับ");
  const attack = /^(.+) pressure$/.exec(label);
  if (attack) return t("เน้นบุกบริเวณ {area}", { area: attack[1] });
  const defense = /^(.+)-weighted defense$/.exec(label);
  if (defense) return t("เน้นตั้งรับบริเวณ {area}", { area: defense[1] });
  return label;
}

function planArea(name: string): "a" | "mid" | "b" {
  const label = name.replace(/\s*·\s*P\d+\s*$/, "").trim().toLowerCase();
  if (label.startsWith("a pressure") || label.startsWith("a-weighted")) return "a";
  if (label.startsWith("b pressure") || label.startsWith("b-weighted")) return "b";
  return "mid";
}

export function CoachPage() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const matches = useQuery(matchesQuery);
  const ready = matches.data?.filter((m) => m.status === "done") ?? [];
  const match = ready.find((m) => m.demo_file === params.get("demo")) ?? ready.find((m) => m.source === "upload" && m.map_name === "de_mirage") ?? ready.find((m) => m.source === "upload") ?? ready[0];
  const side: Side = params.get("side") === "ct" ? "ct" : "t";
  const coach = useQuery({ queryKey: ["coach", match?.demo_file, side], queryFn: () => api.coach(match!.demo_file, side), enabled: !!match });
  const reportMatch = match?.source === "upload" ? match : undefined;
  const round = coach.data?.rounds.find((r) => String(r.round_num) === params.get("round")) ?? coach.data?.rounds[0];
  const planMap = match?.map_name === "de_mirage" || match?.map_name === "de_dust2" ? match.map_name : null;
  const planMapName = planMap === "de_mirage" ? "Mirage" : planMap === "de_dust2" ? "Dust II" : "";
  const planMapFolder = planMap === "de_mirage" ? "mirage" : planMap === "de_dust2" ? "dust2" : "";
  function change(key: string, value: string) {
    const next = new URLSearchParams(params); next.set(key, value);
    if (key === "demo") next.delete("round");
    setParams(next);
  }
  return <section className="coach-page">
    <h1>{t("แผนที่น่าลอง")}</h1>
    <p className="muted">{t("เลือกแมตช์ ฝั่ง และรอบ เพื่อดูแผนที่เหมาะกับอุปกรณ์ของทีมก่อนเริ่มรอบ")}</p>
    <div className="filters card coach-filters">
      <label>{t("แมตช์")}<select name="coach-demo" autoComplete="off" value={match?.demo_file ?? ""} onChange={(e) => change("demo", e.target.value)}>{ready.map((m) => <option key={m.id} value={m.demo_file}>{m.demo_file} · {m.map_name ?? "—"} · {m.source === "upload" ? t("ทีมเรา") : t("ทีมอาชีพ")}</option>)}</select></label>
      <label>{t("ฝั่ง")}<select name="coach-side" autoComplete="off" value={side} onChange={(e) => change("side", e.target.value)}><option value="t">T</option><option value="ct">CT</option></select></label>
      <label>{t("รอบ")}<select name="coach-round" autoComplete="off" value={round?.round_num ?? ""} disabled={!coach.data?.rounds.length} onChange={(e) => change("round", e.target.value)}>{coach.data?.rounds.map((r) => <option key={r.round_num} value={r.round_num}>R{r.round_num}</option>)}</select></label>
    </div>
    {matches.isError || coach.isError ? <div className="card" role="alert">{t("โหลด Coach ไม่สำเร็จ")}<button type="button" className="btn-ghost" onClick={() => { void matches.refetch(); if (match) void coach.refetch(); }}>{t("ลองอีกครั้ง")}</button></div>
      : matches.isPending || (match && coach.isPending) ? <div className="card" role="status">{t("กำลังหาแผนที่เหมาะกับรอบนี้…")}</div>
      : !match ? <div className="card"><p>{t("ยังไม่มีแมตช์ที่พร้อมวิเคราะห์")}</p><Link to="/matches">{t("แมตช์")}</Link></div>
      : !coach.data?.available ? <div className="card"><h2>{t("ยังหาแผนสำหรับรอบนี้ไม่ได้")}</h2><p>{t(REASONS[coach.data?.reason ?? "model_unavailable"])}</p></div>
      : !round ? <div className="card">{t("ไม่มีรอบที่ตรงกับตัวกรอง")}</div>
      : <>
        <div className="coach-round-heading"><h2>R{round.round_num} · {side.toUpperCase()}</h2><Link to={`/matches/${encodeURIComponent(match.demo_file)}/rounds/${round.round_num}`}>{t("ดูรอบนี้")}</Link><Link to="/analysis?tool=opening-route">{t("เส้นทางเปิดรอบ")}</Link></div>
        {!round.available ? <div className="card"><p>{t(REASONS[round.reason ?? "insufficient_support"])}</p></div> : <>
          <div className="coach-options">{round.options.map((option, index) => {
            const area = planArea(option.name);
            const areaLabel = area.toUpperCase();
            return <article className="card coach-plan-card" key={option.id}>
              {planMap && <div className="coach-plan-media"><img src={`/site-prediction/${planMapFolder}/${area}.jpg`} alt={t("ภาพบริเวณ {area} ของแมพ {map}", { area: areaLabel, map: planMapName })} loading="lazy" /><span>{planMapName} · {areaLabel}</span></div>}
              <div className="coach-plan-body">
                <h2>{index + 1}. {planLabel(option.name, t)}</h2>
                <p className="small muted">{t("พบแผนนี้ใน {rounds} รอบที่ชนะ จาก {matches} แมตช์อาชีพ", { rounds: option.rounds, matches: option.matches })}</p>
                <p className="small muted">{t("ประมาณวินาทีที่ 15 ผู้เล่นของทีมอยู่บริเวณไหนบ้าง")}</p>
                <dl className="coach-profile">{(["a", "mid", "b", "other"] as const).map((profileArea) => <div key={profileArea}><dt>{profileArea === "other" ? t("พื้นที่อื่น") : profileArea.toUpperCase()}</dt><dd>{Math.round(option.profile[`${profileArea}_15`] * 100)}%</dd></div>)}</dl>
              </div>
            </article>;
          })}</div>
        </>}
      </>}
    {reportMatch ? <AnalysisReportExport
      match={reportMatch}
      initialSide={side}
    /> : match ? <p className="coach-report-reference muted small">{t("CS2 Performance Report ใช้ได้กับแมตช์ที่ทีมอัปโหลดเท่านั้น")}</p> : null}
  </section>;
}
