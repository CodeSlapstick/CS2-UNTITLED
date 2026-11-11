import { useT } from "@/shared/i18n";
import { localizeReport } from "../utils/localizeReport";
import type { RefObject, ReactNode } from "react";
import type { MatchEconomy, PlayerBehavior } from "@/shared/api";
import type {
  ReportData,
  ReportInsight,
} from "@/features/reports/types/report";
import type {
  CoachExportOptions,
  CoachHeatmapDocumentData,
  CoachSectionId,
} from "@/features/coach/types";
import { ECONOMY_TEAM_COLORS, ReportEconomyChart } from "./ReportEconomyChart";

export function ReportDocument({
  report: originalReport,
  documentRef,
  economy,
  behavior,
  documentKind = originalReport.header.report_type,
  coachOptions,
  coachHeatmap,
}: {
  report: ReportData;
  documentRef: RefObject<HTMLDivElement | null>;
  economy?: MatchEconomy;
  behavior?: PlayerBehavior;
  documentKind?: "match" | "coach" | "player";
  coachOptions?: CoachExportOptions;
  coachHeatmap?: CoachHeatmapDocumentData;
}) {
  const { t: tr } = useT();
  const { lang } = useT();
  const report = localizeReport(originalReport, lang);
  if (documentKind === "coach" && coachOptions)
    return (
      <CoachSelectedDocument
        report={report}
        documentRef={documentRef}
        economy={economy}
        behavior={behavior}
        options={coachOptions}
        heatmap={coachHeatmap}
      />
    );
  const h = report.header;
  const playerTeam =
    behavior?.players?.find((profile) => profile.steamid === h.player_id)
      ?.team ?? null;
  return (
    <div ref={documentRef} className="pr-document">
      <Page n={1} report={report} title={tr("ภาพรวมการแข่งขัน")}>
        <div className="pr-title-block">
          <p>CS2 PERFORMANCE REPORT</p>
          <h1>
            {h.team_a ?? tr("ทีม A")} vs {h.team_b ?? tr("ทีม B")}
          </h1>
          <strong>
            {documentKind === "match"
              ? "Full match report"
              : documentKind === "coach"
                ? tr("Coach report — {v0}", {v0: h.team_a ?? tr("ทีม")})
                : tr("Player — {v0}", {v0: h.player_name ?? tr("ไม่ระบุ")})}
          </strong>
        </div>
        <dl className="pr-meta">
          <Row k={tr("แมตช์")} v={h.demo_file} />
          <Row k={tr("แผนที่")} v={h.map_name ?? "—"} />
          {documentKind === "player" && (
            <Row
              k={tr("ผู้เล่น / ทีม")}
              v={tr("{v0} / {v1}", {v0: h.player_name ?? tr("ไม่ระบุ"), v1: playerTeam ?? tr("ไม่มีข้อมูลทีม")})}
            />
          )}
          <Row k={tr("ผลตามฝั่ง")} v={`CT ${h.score_ct} — ${h.score_t} T`} />
          <Row k={tr("วันที่แข่งขัน")} v={formatDate(h.match_date)} />
          <Row k={tr("วันที่สร้าง")} v={formatDate(h.generated_at)} />
          <Row
            k={tr("ขอบเขต")}
            v={
              report.side === "all" ? tr("ทั้งสองฝั่ง") : report.side.toUpperCase()
            }
          />
          <Row k={tr("ความสมบูรณ์")} v={tr("{v0} รอบ", {v0: report.data_quality.rounds})} />
          <Row k="Dataset version" v={h.dataset_version} />
        </dl>
        <Section n="1" title={tr("สรุปสำหรับตัดสินใจ")}>
          <ol>
            {report.executive_summary.slice(0, 5).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ol>
        </Section>
        <Section n="2" title={tr("ตัวเลขสำคัญ")}>
          <table>
            <thead>
              <tr>
                <th>KPI</th>
                <th> {tr("ค่าปัจจุบัน")} </th>
                <th> {tr("ค่าเปรียบเทียบ")} </th>
                <th>Sample</th>
                <th> {tr("คำอธิบาย")} </th>
              </tr>
            </thead>
            <tbody>
              {report.kpis.map((k) => (
                <tr key={k.key}>
                  <td>{k.label}</td>
                  <td>{k.value ?? tr("ไม่มีข้อมูล")}</td>
                  <td>{k.comparison ?? tr("ไม่มี")}</td>
                  <td>{k.sample_size}</td>
                  <td>{k.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </Page>
      <Page n={2} report={report} title={tr("ประเด็นสำคัญและหลักฐาน")}>
        <Section n="3" title={tr("ประเด็นสำคัญ")}>
          {report.insights.map((i) => (
            <Insight key={i.key} insight={i} />
          ))}
          {!report.insights.length && (
            <p> {tr("ข้อมูลยังไม่เพียงพอสำหรับสร้างประเด็นสำคัญ")} </p>
          )}
        </Section>
      </Page>
      <Page n={3} report={report} title={tr("รอบสำคัญและการเล่นรายฝั่ง")}>
        <Section n="4" title={tr("รอบที่ควรเปิดดูย้อนหลัง")}>
          <table>
            <thead>
              <tr>
                <th> {tr("รอบ")} </th>
                <th>Buy type</th>
                <th> {tr("เหตุการณ์")} </th>
                <th> {tr("จุดที่ควรแก้")} </th>
              </tr>
            </thead>
            <tbody>
              {report.turning_points.map((r) => (
                <tr key={r.round_num}>
                  <td>{r.round_num}</td>
                  <td>{r.buy_type ?? "—"}</td>
                  <td>{r.event}</td>
                  <td>{r.improvement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section n="5" title={tr("วิเคราะห์รายฝั่ง")}>
          <div className="pr-two-col">
            {report.side_analysis.map((s) => (
              <article key={s.side}>
                <h3>{s.side.toUpperCase()} SIDE</h3>
                <p>
                  <b> {tr("ผลงาน:")} </b> {tr("ชนะ")} {s.wins}/{s.rounds} {tr("รอบ")} </p>
                <p>
                  <b> {tr("สิ่งที่ทำได้ดี:")} </b> {s.strengths.join("; ")}
                </p>
                <p>
                  <b> {tr("ปัญหา:")} </b> {s.problems.join("; ")}
                </p>
                <p>
                  <b> {tr("หลักฐาน:")} </b> {s.evidence.join("; ")}
                </p>
                <p>
                  <b> {tr("แนวทางแก้:")} </b> {s.actions.join("; ")}
                </p>
              </article>
            ))}
          </div>
        </Section>
        <Section n="6" title={tr("วิเคราะห์ Economy")}>
          <table>
            <thead>
              <tr>
                <th> {tr("รอบ")} </th>
                <th> {tr("การซื้อ")} </th>
                <th> {tr("ผล")} </th>
                <th> {tr("ข้อเสนอแนะ")} </th>
              </tr>
            </thead>
            <tbody>
              {report.economy.map((e) => (
                <tr key={e.round_num}>
                  <td>{e.round_num}</td>
                  <td>{e.buy_type}</td>
                  <td>{e.result}</td>
                  <td>{e.recommendation}</td>
                </tr>
              ))}
              {!report.economy.length && (
                <tr>
                  <td colSpan={4}> {tr("ไม่พบรอบที่เข้าเกณฑ์จากข้อมูลที่มี")} </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
        {h.report_type === "player" && (
          <Section n="7" title={tr("รายงานสำหรับผู้เล่น")}>
            {report.players.map((p) => (
              <p key={p.steam_id}>
                <b>{p.name}</b>: {p.kills}/{p.deaths}/{p.assists}, ADR {p.adr},
                KAST {p.kast}%, Rating {p.rating} · Opening {p.opening_kills}/
                {p.opening_deaths} · Trade kills {p.trade_kills}
              </p>
            ))}
          </Section>
        )}
      </Page>
      <Page n={4} report={report} title={tr("Economy ของแมตช์")}>
        <Section n="7" title={tr("มูลค่าอุปกรณ์รายรอบ")}>
          {economy && economy.rounds.length ? (
            <>
              <div className="pr-economy-legend">
                {economy.teams.map((team, index) => (
                  <span key={team}>
                    <i style={{ background: ECONOMY_TEAM_COLORS[index] }} />
                    {team}
                  </span>
                ))}
              </div>
              <ReportEconomyChart data={economy} />
              <EconomyTable data={economy} />
            </>
          ) : (
            <p> {tr("ไม่มีข้อมูล Economy สำหรับแมตช์นี้")} </p>
          )}
          {economy && <EconomyShifts data={economy} />}
        </Section>
      </Page>
      <Page n={5} report={report} title={tr("แผนฝึกและเป้าหมายนัดถัดไป")}>
        <Section n={h.report_type === "player" ? "8" : "7"} title={tr("แผนการฝึก")}>
          {report.training_plan.map((a) => (
            <article className="pr-training" key={a.title}>
              <h3>{a.title}</h3>
              <dl>
                <Row k={tr("ปัญหา")} v={a.problem} />
                <Row k={tr("หลักฐาน")} v={a.evidence} />
                <Row k={tr("วิธีฝึก")} v={a.method} />
                <Row k={tr("ผู้รับผิดชอบ")} v={a.owner} />
                <Row k={tr("ระยะเวลา")} v={a.duration} />
                <Row k={tr("KPI เป้าหมาย")} v={a.target} />
                <Row k={tr("วันที่ตรวจผล")} v={a.review_after} />
              </dl>
            </article>
          ))}
        </Section>
        {documentKind === "player" && (
          <Section n="Player Role" title={tr("บทบาทและพฤติกรรมจากข้อมูล")}>
            <PlayerBehaviorEvidence
              behavior={behavior}
              playerId={h.player_id}
            />
          </Section>
        )}
        <Section
          n={h.report_type === "player" ? "9" : "8"}
          title={tr("เป้าหมายนัดถัดไป")}
        >
          <ol>
            {report.next_match_goals.slice(0, 3).map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </Section>
        <Section
          n={h.report_type === "player" ? "10" : "9"}
          title={tr("หมายเหตุเกี่ยวกับข้อมูล")}
        >
          <ul>
            <li> {tr("ใช้ Demo")} {report.data_quality.demos} {tr("ไฟล์ จำนวน")} {" "}
              {report.data_quality.rounds} {tr("รอบ")} </li>
            <li> {tr("ข้อมูลที่ขาด:")} {report.data_quality.missing.join("; ") || tr("ไม่มี")}
            </li>
            <li> {tr("ค่าประมาณ:")} {report.data_quality.estimated.join("; ") || tr("ไม่มี")}
            </li>
            {report.data_quality.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      </Page>
    </div>
  );
}

const coachTitles: Record<CoachSectionId, string> = {
  overview: "Match Overview",
  scoreboard: "Scoreboard",
  rounds: "Round Summary",
  heatmap: "Heatmap",
  economy: "Economy",
  roles: "Player Roles",
  comparison: "Team Comparison",
  utility: "Utility Analysis",
  moments: "Key Moments",
  notes: "Coaching Notes",
};
function CoachSelectedDocument({
  report,
  documentRef,
  economy,
  behavior,
  options,
  heatmap,
}: {
  report: ReportData;
  documentRef: RefObject<HTMLDivElement | null>;
  economy?: MatchEconomy;
  behavior?: PlayerBehavior;
  options: CoachExportOptions;
  heatmap?: CoachHeatmapDocumentData;
}) {
  const { t: tr } = useT();
  const total = options.sections.length + 1;
  return (
    <div ref={documentRef} className="pr-document">
      <ReportPage
        n={1}
        total={total}
        report={report}
        title={tr("สารบัญ")}
        section={tr("สารบัญ")}
      >
        <div className="pr-title-block">
          <p>CS2 COACH REPORT</p>
          <h1>
            {report.header.team_a ?? tr("ทีม A")} vs{" "}
            {report.header.team_b ?? tr("ทีม B")}
          </h1>
          <strong>{report.header.map_name ?? tr("ไม่ระบุแผนที่")}</strong>
        </div>
        <ol className="pr-toc">
          {options.sections.map((id, i) => (
            <li key={id}>
              <span>{coachTitles[id]}</span>
              <b>{i + 2}</b>
            </li>
          ))}
        </ol>
      </ReportPage>
      {options.sections.map((id, index) => (
        <ReportPage
          key={id}
          n={index + 2}
          total={total}
          report={report}
          title={coachTitles[id]}
          section={coachTitles[id]}
        >
          <CoachSection
            id={id}
            report={report}
            economy={economy}
            behavior={behavior}
            options={options}
            heatmap={heatmap}
          />
        </ReportPage>
      ))}
    </div>
  );
}
function CoachSection({
  id,
  report,
  economy,
  behavior,
  options,
  heatmap,
}: {
  id: CoachSectionId;
  report: ReportData;
  economy?: MatchEconomy;
  behavior?: PlayerBehavior;
  options: CoachExportOptions;
  heatmap?: CoachHeatmapDocumentData;
}) {
  const { t: tr } = useT();
  const h = report.header;
  if (id === "overview")
    return (
      <>
        <div className="pr-title-block">
          <p>CS2 PERFORMANCE REPORT</p>
          <h1>
            {h.team_a ?? tr("ทีม A")} vs {h.team_b ?? tr("ทีม B")}
          </h1>
        </div>
        <dl className="pr-meta">
          <Row k={tr("แมตช์")} v={h.demo_file} />
          <Row k={tr("แผนที่")} v={h.map_name ?? tr("ไม่มีข้อมูล")} />
          <Row k={tr("คะแนน")} v={`CT ${h.score_ct} — ${h.score_t} T`} />
          <Row k={tr("จำนวนรอบ")} v={String(h.rounds)} />
          <Row k={tr("วันที่แข่งขัน")} v={formatDate(h.match_date)} />
        </dl>
        <Section n="1" title={tr("สรุป")}>
          <ol>
            {report.executive_summary.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </Section>
      </>
    );
  if (id === "scoreboard")
    return (
      <table>
        <thead>
          <tr>
            <th> {tr("ผู้เล่น")} </th>
            <th>K-D-A</th>
            <th>ADR</th>
            <th>KAST</th>
            <th>Opening</th>
            <th>Trade</th>
          </tr>
        </thead>
        <tbody>
          {report.players.map((p) => (
            <tr key={p.steam_id}>
              <td>{p.name}</td>
              <td>
                {p.kills}-{p.deaths}-{p.assists}
              </td>
              <td>{p.adr}</td>
              <td>{p.kast}%</td>
              <td>
                {p.opening_kills}/{p.opening_deaths}
              </td>
              <td>{p.trade_kills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (id === "rounds" || id === "moments")
    return (
      <table>
        <thead>
          <tr>
            <th> {tr("รอบ")} </th>
            <th> {tr("การซื้อ")} </th>
            <th> {tr("เหตุการณ์")} </th>
            <th> {tr("จุดปรับ")} </th>
          </tr>
        </thead>
        <tbody>
          {report.turning_points.map((r) => (
            <tr key={r.round_num}>
              <td>R{r.round_num}</td>
              <td>{r.buy_type ?? tr("ไม่มีข้อมูล")}</td>
              <td>{r.event}</td>
              <td>{r.improvement}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (id === "heatmap")
    return heatmap ? (
      <div className="pr-report-heatmap">
        <div>
          <img
            src={heatmap.data.radar.image}
            alt={`Radar ${heatmap.data.map}`}
          />
          <svg
            viewBox={`0 0 ${heatmap.data.radar.size} ${heatmap.data.radar.size}`}
            style={{ opacity: heatmap.options.opacity }}
          >
            {heatmap.data.points.slice(0, 5000).map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={heatmap.options.radius}
                fill="#ff4d28"
                opacity={Math.min(0.34, 0.07 + heatmap.options.blur / 160)}
              />
            ))}
          </svg>
        </div>
        <p>
          {heatmap.data.event} · {heatmap.data.count.toLocaleString()} {tr("จุด · ฝั่ง")} {heatmap.options.side.toUpperCase()}
        </p>
      </div>
    ) : (
      <p> {tr("ไม่มีข้อมูล Heatmap สำหรับตัวกรองที่เลือก")} </p>
    );
  if (id === "economy") {
    const teams =
      economy?.teams.filter(
        (_, i) =>
          options.economy.team === "all" ||
          (options.economy.team === "ours" ? i === 0 : i === 1),
      ) ?? [];
    const rounds =
      economy?.rounds.filter(
        (r) =>
          r.round_num >= options.economy.fromRound &&
          r.round_num <= options.economy.toRound,
      ) ?? [];
    const filtered = economy ? { ...economy, teams, rounds } : undefined;
    return filtered && rounds.length ? (
      <>
        {options.economy.showChart && <ReportEconomyChart data={filtered} />}{" "}
        {options.economy.showTable && <EconomyTable data={filtered} />}
        <EconomyShifts data={filtered} />
      </>
    ) : (
      <p> {tr("ไม่มีข้อมูล Economy ในช่วงรอบที่เลือก")} </p>
    );
  }
  if (id === "roles")
    return behavior?.available ? (
      <div className="pr-two-col">
        {behavior.players?.map((p) => (
          <article key={`${p.steamid}-${p.side}`}>
            <h3>
              {p.name} · {p.side.toUpperCase()}
            </h3>
            <p>
              <b>
                {p.available ? (p.role ?? tr("ยังสรุปไม่ได้")) : tr("ข้อมูลไม่เพียงพอ")}
              </b>
            </p>
            <p>
              {p.available
                ? tr("อ้างอิงจาก {v0} รอบ", {v0: p.rounds})
                : tr("ต้องมีข้อมูลรอบเพิ่ม")}
            </p>
          </article>
        ))}
      </div>
    ) : (
      <p> {tr("ข้อมูลไม่เพียงพอสำหรับ Player Roles")} </p>
    );
  if (id === "comparison")
    return (
      <div className="pr-two-col">
        {report.side_analysis.map((s) => (
          <article key={s.side}>
            <h3>{s.side.toUpperCase()} SIDE</h3>
            <p> {tr("ชนะ")} {s.wins}/{s.rounds} {tr("รอบ")} </p>
            <p>
              <b> {tr("จุดแข็ง:")} </b> {s.strengths.join("; ")}
            </p>
            <p>
              <b> {tr("ปัญหา:")} </b> {s.problems.join("; ")}
            </p>
          </article>
        ))}
      </div>
    );
  if (id === "utility") {
    const rows = report.insights.filter((i) =>
      /utility|smoke|flash|molotov|grenade/i.test(
        `${i.key} ${i.title} ${i.observation}`,
      ),
    );
    return (
      <>
        {rows.map((i) => (
          <Insight key={i.key} insight={i} />
        ))}
      </>
    );
  }
  return (
    <>
      {report.training_plan.map((a) => (
        <article className="pr-training" key={a.title}>
          <h3>{a.title}</h3>
          <dl>
            <Row k={tr("ปัญหา")} v={a.problem} />
            <Row k={tr("หลักฐาน")} v={a.evidence} />
            <Row k={tr("วิธีฝึก")} v={a.method} />
            <Row k={tr("เป้าหมาย")} v={a.target} />
          </dl>
        </article>
      ))}
    </>
  );
}
function ReportPage({
  n,
  total,
  report,
  title,
  section,
  children,
}: {
  n: number;
  total: number;
  report: ReportData;
  title: string;
  section: string;
  children: ReactNode;
}) {
  const { t: tr } = useT();
  return (
    <article className="pr-page" data-report-section={section}>
      <header>
        <b>CS2 COACH REPORT</b>
        <span>{report.header.demo_file}</span>
        <strong>{title}</strong>
      </header>
      <div className="pr-page-content">{children}</div>
      <footer>
        <span>
          {report.header.team_a ?? tr("ทีม")} · {report.header.map_name ?? "—"}
        </span>
        <b> {tr("หน้า")} {n} / {total}
        </b>
      </footer>
    </article>
  );
}

function Page({
  n,
  report,
  title,
  children,
}: {
  n: number;
  report: ReportData;
  title: string;
  children: ReactNode;
}) {
  const { t: tr } = useT();
  return (
    <article className="pr-page">
      <header>
        <b>CS2 PERFORMANCE REPORT</b>
        <span>{report.header.demo_file}</span>
        <strong>{title}</strong>
      </header>
      <div className="pr-page-content">{children}</div>
      <footer>
        <span> {tr("สร้างเมื่อ")} {formatDate(report.header.generated_at)} ·{" "}
          {report.header.report_type === "coach"
            ? "Coach report"
            : `Player report: ${report.header.player_name ?? "—"}`}
        </span>
        <b> {tr("หน้า")} {n} / 5</b>
      </footer>
    </article>
  );
}
function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="pr-section">
      <h2>
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
function Insight({ insight: i }: { insight: ReportInsight }) {
  const { t: tr } = useT();
  return (
    <article className="pr-issue">
      <h3>{i.title}</h3>
      <dl>
        <Row k={tr("สิ่งที่เกิดขึ้น")} v={i.observation} />
        <Row k={tr("ผลกระทบ")} v={i.impact} />
        <Row
          k={tr("หลักฐาน")}
          v={i.evidence.map((e) => e.text).join("; ") || tr("ไม่มีรอบอ้างอิง")}
        />
        <Row
          k={tr("สาเหตุที่เป็นไปได้")}
          v={i.possible_causes.join("; ") || tr("ยังไม่มีข้อมูลยืนยัน")}
        />
        <Row k={tr("ความเชื่อมั่น")} v={`${i.confidence} (n=${i.sample_size})`} />
        <Row k={tr("วิธีแก้")} v={i.recommendation} />
        <Row k={tr("เป้าหมาย")} v={i.next_target} />
      </dl>
    </article>
  );
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB").format(date);
}

const buyLabel: Record<string, string> = {
  pistol: "Pistol",
  eco: "Eco",
  semi_eco: "Semi-eco",
  semi_buy: "Semi-buy",
  full: "Full-buy",
};
function money(value: number | null | undefined, tr: ReturnType<typeof useT>["t"]) {
  return value == null ? tr("ไม่มีข้อมูล") : `$${value.toLocaleString()}`;
}
function EconomyTable({ data }: { data: MatchEconomy }) {
  const { t: tr } = useT();
  return (
    <table className="pr-economy-table">
      <thead>
        <tr>
          <th> {tr("รอบ")} </th>
          {data.teams.map((team) => (
            <th key={team}>{team}</th>
          ))}
          <th> {tr("ผู้ชนะ")} </th>
        </tr>
      </thead>
      <tbody>
        {data.rounds.map((round) => (
          <tr key={round.round_num}>
            <td>{round.round_num}</td>
            {data.teams.map((team) => {
              const item = round.teams[team];
              return (
                <td key={team}>
                  {money(item?.equip, tr)}
                  <br />
                  <small>
                    {item?.buy_type ? buyLabel[item.buy_type] : tr("ไม่มีข้อมูล")} ·{" "}
                    {item?.side?.toUpperCase() ?? "—"}
                  </small>
                </td>
              );
            })}
            <td>
              {round.winner_team ??
                round.winner_side?.toUpperCase() ??
                tr("ไม่มีข้อมูล")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function EconomyShifts({ data }: { data: MatchEconomy }) {
  const { t: tr } = useT();
  const shifts = data.rounds
    .filter((round, index) =>
      data.teams.some((team) => {
        const current = round.teams[team];
        const previous = data.rounds[index - 1]?.teams[team];
        return (
          current?.buy_type === "semi_buy" ||
          (!!current?.equip &&
            !!previous?.equip &&
            current.equip < previous.equip * 0.55)
        );
      }),
    )
    .slice(0, 6);
  return (
    <div className="pr-economy-shifts">
      <b> {tr("จุดเปลี่ยนที่ตรวจพบจากข้อมูล")} </b>
      {shifts.length ? (
        <ul>
          {shifts.map((round) => (
            <li key={round.round_num}> {tr("รอบ")} {round.round_num}:{" "}
              {data.teams
                .map(
                  (team) =>
                    tr("{v0} {v1}", {v0: team, v1: round.teams[team]?.buy_type ? buyLabel[round.teams[team].buy_type!] : tr("ไม่มีข้อมูล")}),
                )
                .join(" · ")}{" "} {tr("· ผู้ชนะ")} {round.winner_team ?? tr("ไม่มีข้อมูล")}
            </li>
          ))}
        </ul>
      ) : (
        <p> {tr("ไม่พบ force/semi-buy หรือการลดลงของมูลค่าอุปกรณ์ตามเกณฑ์ที่ใช้")} </p>
      )}
    </div>
  );
}
function PlayerBehaviorEvidence({
  behavior,
  playerId,
}: {
  behavior?: PlayerBehavior;
  playerId: string | null;
}) {
  const { t: tr } = useT();
  const profiles =
    behavior?.players?.filter((profile) => profile.steamid === playerId) ?? [];
  if (!behavior?.available || !profiles.length)
    return <p> {tr("ข้อมูลไม่เพียงพอสำหรับสรุป Player Role")} </p>;
  return (
    <div className="pr-two-col">
      {profiles.map((profile) => (
        <article key={`${profile.steamid}-${profile.side}`}>
          <h3>
            {profile.side.toUpperCase()} · {profile.role ?? tr("ข้อมูลไม่เพียงพอ")}
          </h3>
          <p> {tr("ทีม:")} {profile.team ?? tr("ไม่ระบุ")} {tr("· อ้างอิงจาก")} {profile.rounds} {tr("รอบ")} </p>
        </article>
      ))}
    </div>
  );
}
