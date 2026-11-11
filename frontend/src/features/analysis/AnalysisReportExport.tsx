import { LangToggle, useT } from "@/shared/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type HeatEvent, type Match } from "@/shared/api";
import { ReportDocument } from "@/features/reports/components/ReportDocument";
import { useReport } from "@/features/reports/hooks/useReport";
import { useReportExport } from "@/features/reports/hooks/useReportExport";
import type {
  CoachExportOptions,
  CoachSectionId,
} from "@/features/coach/types";
import type { ReportSide } from "@/features/reports/types/report";
type Target =
  | {
      kind: "match" | "coach";
      playerId?: never;
    }
  | {
      kind: "player";
      playerId: string;
    };
type Props = {
  match?: Match;
  initialSide?: ReportSide;
};
const STORE = "cs2-coach-export-options-v1";
const safePart = (value: string) =>
  value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/[. ]+$/g, "")
    .trim() || "unknown";
const META: {
  id: CoachSectionId;
  title: string;
  description: string;
}[] = [
  {
    id: "overview",
    title: "Match Overview",
    description: "ผลการแข่งขัน แผนที่ คะแนน และข้อมูลทีม",
  },
  {
    id: "scoreboard",
    title: "Scoreboard",
    description: "สถิติผู้เล่นทั้งสองทีม",
  },
  {
    id: "rounds",
    title: "Round Summary",
    description: "ผู้ชนะ เหตุการณ์ และจุดเปลี่ยนในแต่ละรอบ",
  },
  {
    id: "heatmap",
    title: "Heatmap",
    description: "ตำแหน่ง การตาย การสังหาร และ utility",
  },
  {
    id: "economy",
    title: "Economy",
    description: "มูลค่าอุปกรณ์ ประเภทการซื้อ และผลลัพธ์แต่ละรอบ",
  },
  {
    id: "roles",
    title: "Player Roles",
    description: "บทบาทและพฤติกรรมของผู้เล่น",
  },
  {
    id: "comparison",
    title: "Team Comparison",
    description: "เปรียบเทียบทีมเราและคู่แข่ง",
  },
  {
    id: "utility",
    title: "Utility Analysis",
    description: "Smoke, Flash, HE และ Molotov",
  },
  {
    id: "moments",
    title: "Key Moments",
    description: "Opening duel, trade, clutch และเหตุการณ์สำคัญ",
  },
  {
    id: "notes",
    title: "Coaching Notes",
    description: "จุดแข็ง ปัญหาที่เกิดซ้ำ และประเด็นฝึกซ้อม",
  },
];
const defaults: CoachExportOptions = {
  sections: META.map((x) => x.id),
  heatmap: {
    event: "kills",
    team: "all",
    side: "all",
    roundPreset: "all",
    customRounds: "",
    players: [],
    radius: 18,
    blur: 14,
    opacity: 0.82,
  },
  economy: {
    team: "all",
    fromRound: 1,
    toRound: 99,
    showChart: true,
    showBuyTypes: true,
    showTable: true,
  },
};
function loadSaved(): CoachExportOptions {
  try {
    const value = JSON.parse(
      localStorage.getItem(STORE) ?? "null",
    ) as CoachExportOptions | null;
    return value
      ? {
          ...defaults,
          ...value,
          sections: [
            "overview",
            ...value.sections.filter((id) => id !== "overview"),
          ],
        }
      : defaults;
  } catch {
    return defaults;
  }
}
function customRounds(value: string) {
  return [
    ...new Set(
      value
        .split(/[ ,]+/)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}
export function AnalysisReportExport({ match, initialSide = "all" }: Props) {
  const { t } = useT();
  const documentRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<ReportSide>(initialSide);
  const [target, setTarget] = useState<Target>({ kind: "match" });
  const [queued, setQueued] = useState(false);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CoachExportOptions>(loadSaved);
  const coach = useReport(match?.id, "coach", side);
  const selectedPlayer =
    target.kind === "player"
      ? coach.data?.players.find((p) => p.steam_id === target.playerId)
      : undefined;
  const player = useReport(
    match?.id,
    "player",
    side,
    selectedPlayer?.steam_id,
    target.kind === "player",
  );
  const current = target.kind === "player" ? player : coach;
  const economy = useQuery({
    queryKey: ["report-economy", match?.demo_file],
    queryFn: () => api.economy(match!.demo_file),
    enabled: !!match,
  });
  const behavior = useQuery({
    queryKey: ["report-behavior", match?.demo_file],
    queryFn: () => api.playerBehavior(match!.demo_file),
    enabled: !!match,
    retry: false,
  });
  const players = useMemo(
    () => coach.data?.players ?? [],
    [coach.data?.players],
  );
  const rounds = useMemo(() => {
    const total = match?.rounds ?? 0;
    if (options.heatmap.roundPreset === "first")
      return Array.from({ length: Math.ceil(total / 2) }, (_, i) => i + 1);
    if (options.heatmap.roundPreset === "second")
      return Array.from(
        { length: Math.floor(total / 2) },
        (_, i) => i + Math.ceil(total / 2) + 1,
      );
    if (options.heatmap.roundPreset === "custom")
      return customRounds(options.heatmap.customRounds);
    return null;
  }, [
    match?.rounds,
    options.heatmap.roundPreset,
    options.heatmap.customRounds,
  ]);
  const chosenPlayers =
    options.heatmap.team === "all"
      ? options.heatmap.players
      : players
          .filter((p) => {
            const team = behavior.data?.players?.find(
              (profile) => profile.steamid === p.steam_id,
            )?.team;
            return options.heatmap.team === "ours"
              ? team === match?.team_a
              : team === match?.team_b;
          })
          .map((p) => p.steam_id)
          .filter(
            (id) =>
              !options.heatmap.players.length ||
              options.heatmap.players.includes(id),
          );
  const heatmap = useQuery({
    queryKey: [
      "coach-export-heatmap",
      match?.demo_file,
      options.heatmap.event,
      options.heatmap.side,
      chosenPlayers,
      rounds,
    ],
    queryFn: () =>
      api.heatmap(
        match!.demo_file,
        options.heatmap.event,
        options.heatmap.side,
        chosenPlayers.length ? chosenPlayers : null,
        rounds,
      ),
    enabled:
      !!match &&
      (open ||
        (target.kind === "coach" && options.sections.includes("heatmap"))),
    retry: false,
  });
  const matchName = safePart(
    `${match?.team_a || "Team-A"}-vs-${match?.team_b || "Team-B"}`,
  );
  const filename =
    target.kind === "player"
      ? `player_${safePart(selectedPlayer?.name ?? "player")}_${matchName}`
      : target.kind === "coach"
        ? `coach_${safePart(match?.team_a || "team")}_${matchName}`
        : `match_${matchName}`;
  const exporter = useReportExport(current.data, documentRef, filename);
  const busy = queued || !!exporter.working || current.isLoading;
  const available: Record<
    CoachSectionId,
    {
      ok: boolean;
      reason?: string;
    }
  > = {
    overview: { ok: true },
    scoreboard: {
      ok: players.length > 0,
      reason: t("ไม่พบสถิติผู้เล่นในแมตช์"),
    },
    rounds: {
      ok: !!coach.data?.turning_points.length,
      reason: t("ไม่พบเหตุการณ์รายรอบที่มีหลักฐาน"),
    },
    heatmap: {
      ok: !heatmap.error && (!heatmap.data || !!heatmap.data.count),
      reason: heatmap.error
        ? (heatmap.error as Error).message
        : t("ไม่พบจุดสำหรับตัวกรองนี้"),
    },
    economy: {
      ok: economy.isLoading || !!economy.data?.rounds.length,
      reason: t("ไม่มีข้อมูลมูลค่าอุปกรณ์รายรอบ"),
    },
    roles: {
      ok: behavior.isLoading || !!behavior.data?.available,
      reason: behavior.data?.reason ?? t("ข้อมูลไม่พอสำหรับสรุปบทบาท"),
    },
    comparison: {
      ok: !!coach.data?.side_analysis.length,
      reason: t("ไม่มีข้อมูลสำหรับเปรียบเทียบ"),
    },
    utility: {
      ok: !!coach.data?.insights.some((i) =>
        /utility|smoke|flash|molotov|grenade/i.test(
          `${i.key} ${i.title} ${i.observation}`,
        ),
      ),
      reason: t("ไม่มีหลักฐาน Utility ที่สรุปได้"),
    },
    moments: {
      ok: !!coach.data?.turning_points.length,
      reason: t("ไม่พบเหตุการณ์สำคัญที่มีหลักฐาน"),
    },
    notes: {
      ok: !!coach.data?.training_plan.length,
      reason: t("ยังไม่มีประเด็นฝึกซ้อมที่มีหลักฐาน"),
    },
  };
  useEffect(() => setSide(initialSide), [initialSide]);
  useEffect(() => {
    setTarget({ kind: "match" });
    setQueued(false);
    setOpen(false);
  }, [match?.id]);
  useEffect(() => {
    if (
      !queued ||
      !current.data ||
      current.isLoading ||
      economy.isLoading ||
      (target.kind === "coach" &&
        options.sections.includes("heatmap") &&
        heatmap.isLoading)
    )
      return;
    setQueued(false);
    void exporter.pdf();
  }, [
    queued,
    current.data,
    current.isLoading,
    economy.isLoading,
    heatmap.isLoading,
  ]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const download = (next: Target) => {
    if (busy) return;
    if (next.kind === "coach") {
      setSections(options.sections);
      setOpen(true);
      return;
    }
    setTarget(next);
    setQueued(true);
  };
  const setSections = (sections: CoachSectionId[]) =>
    setOptions((old) => ({
      ...old,
      sections: [
        "overview",
        ...sections.filter((id) => id !== "overview" && available[id].ok),
      ],
    }));
  const createCoach = () => {
    localStorage.setItem(STORE, JSON.stringify(options));
    setTarget({ kind: "coach" });
    setOpen(false);
    setQueued(true);
  };
  return (
    <section
      className="performance-report"
      aria-labelledby="performance-report-title"
      data-testid="analysis-export"
    >
      <header className="pr-tool-header">
        <div>
          <h2 id="performance-report-title">{t("ดาวน์โหลดรายงาน")}</h2>
          <p>{t("สร้างจากข้อมูลแมตช์ที่เลือก ไม่ใช้ข้อมูลจำลอง")}</p>
        </div>
        <LangToggle />
        <label className="pr-side-filter">
          {t("ขอบเขต")}
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as ReportSide)}
            disabled={busy}
          >
            <option value="all">{t("ทั้งสองฝั่ง")}</option>
            <option value="ct">CT</option>
            <option value="t">T</option>
          </select>
        </label>
      </header>
      {!match && (
        <div className="pr-empty">
          <p>{t("ยังไม่ได้เลือกแมตช์")}</p>
          <a className="btn-primary" href="/matches">
            {t("ไปหน้า Matches")}
          </a>
        </div>
      )}
      {match && coach.isLoading && (
        <p className="pr-empty" role="status">
          {t("กำลังเตรียมข้อมูลรายงานจากแมตช์…")}
        </p>
      )}
      {coach.error && (
        <p className="err" role="alert">
          {t("โหลดข้อมูลรายงานไม่สำเร็จ:")} {(coach.error as Error).message}
        </p>
      )}
      {match && coach.data && (
        <div className="pr-download-grid">
          <article>
            <h3>{t("รายงานแมตช์ฉบับเต็ม")}</h3>
            <p>{t("ผลการแข่งขัน ประเด็นสำคัญ รอบสำคัญ และ Economy")}</p>
            <button
              className="btn-primary"
              type="button"
              disabled={busy}
              onClick={() => download({ kind: "match" })}
            >
              {busy && target.kind === "match"
                ? t("กำลังสร้าง…")
                : t("ดาวน์โหลด PDF")}
            </button>
          </article>
          <article>
            <h3>{t("รายงานสำหรับโค้ช")}</h3>
            <p>{t("เลือกหัวข้อ ตัวกรอง Heatmap และ Economy ก่อนสร้างไฟล์")}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => download({ kind: "coach" })}
            >
              {busy && target.kind === "coach"
                ? t("กำลังสร้าง…")
                : t("ตั้งค่ารายงานสำหรับ {team}", {
                    team: match.team_a || t("ทีม"),
                  })}
            </button>
          </article>
          <article className="pr-player-downloads">
            <h3>{t("รายงานผู้เล่นรายคน")}</h3>
            <p>{t("ผู้เล่นหนึ่งคนต่อหนึ่งไฟล์")}</p>
            <div>
              {players.map((p) => (
                <button
                  type="button"
                  key={p.steam_id}
                  disabled={busy}
                  onClick={() =>
                    download({ kind: "player", playerId: p.steam_id })
                  }
                >
                  <span>{p.name}</span>
                  <small>
                    {busy &&
                    target.kind === "player" &&
                    target.playerId === p.steam_id
                      ? t("กำลังสร้าง…")
                      : t("ดาวน์โหลด PDF")}
                  </small>
                </button>
              ))}
            </div>
          </article>
        </div>
      )}
      {(current.error || economy.error) && (
        <p className="err" role="alert">
          {t("สร้างรายงานไม่สำเร็จ:")}{" "}
          {((current.error ?? economy.error) as Error).message}
        </p>
      )}
      {exporter.progress && (
        <p className="pr-export-progress" role="status">
          {t(exporter.progress)}
        </p>
      )}
      {exporter.error && (
        <p className="err" role="alert">
          {t(exporter.error)}
        </p>
      )}
      {current.data && (
        <div className="pr-preview" aria-label={t("ตัวอย่างรายงาน")}>
          <ReportDocument
            report={current.data}
            documentRef={documentRef}
            economy={economy.data}
            behavior={behavior.data}
            documentKind={target.kind}
            coachOptions={target.kind === "coach" ? options : undefined}
            coachHeatmap={
              heatmap.data
                ? { data: heatmap.data, options: options.heatmap }
                : undefined
            }
          />
        </div>
      )}
      {open && (
        <div
          className="coach-export-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="coach-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-export-title"
          >
            <header>
              <div>
                <h2 id="coach-export-title">{t("ตั้งค่ารายงานสำหรับโค้ช")}</h2>
                <p>
                  {match?.team_a} vs {match?.team_b} · {match?.map_name}
                </p>
              </div>
              <button
                className="coach-export-close"
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("ปิด")}
              >
                ×
              </button>
            </header>
            <div className="coach-export-actions">
              <button
                type="button"
                onClick={() =>
                  setSections(
                    META.filter((x) => available[x.id].ok).map((x) => x.id),
                  )
                }
              >
                {t("เลือกทั้งหมด")}
              </button>
              <button type="button" onClick={() => setSections([])}>
                {t("ล้างตัวเลือก")}
              </button>
            </div>
            <div className="coach-export-body">
              <div className="coach-section-list">
                {options.sections.map((id, index) => (
                  <SectionRow
                    key={id}
                    id={id}
                    index={index}
                    checked
                    options={options}
                    available={available}
                    setSections={setSections}
                  />
                ))}
                {META.filter((x) => !options.sections.includes(x.id)).map(
                  (x) => (
                    <SectionRow
                      key={x.id}
                      id={x.id}
                      index={-1}
                      checked={false}
                      options={options}
                      available={available}
                      setSections={setSections}
                    />
                  ),
                )}
              </div>
              <SpecificOptions
                options={options}
                setOptions={setOptions}
                heatmap={heatmap.data}
                loading={heatmap.isLoading}
                players={players}
                totalRounds={match?.rounds ?? 0}
              />
            </div>
            <footer>
              <div>
                <strong>
                  {t("{n} หัวข้อ", { n: options.sections.length })}
                </strong>
                <span>
                  {t("ประมาณ {n} หน้า รวมสารบัญ", {
                    n: Math.max(2, options.sections.length + 1),
                  })}
                </span>
              </div>
              <button
                className="btn-primary"
                type="button"
                disabled={
                  busy || options.sections.some((id) => !available[id].ok)
                }
                onClick={createCoach}
              >
                {t("สร้าง PDF")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
function SectionRow({
  id,
  index,
  checked,
  options,
  available,
  setSections,
}: {
  id: CoachSectionId;
  index: number;
  checked: boolean;
  options: CoachExportOptions;
  available: Record<
    CoachSectionId,
    {
      ok: boolean;
      reason?: string;
    }
  >;
  setSections: (x: CoachSectionId[]) => void;
}) {
  const { t } = useT();
  const meta = META.find((x) => x.id === id)!;
  const state = available[id];
  return (
    <div className={`coach-section-row${!state.ok ? " unavailable" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={id === "overview" || !state.ok}
        aria-label={t(meta.title)}
        onChange={() =>
          setSections(
            checked
              ? options.sections.filter((x) => x !== id)
              : [...options.sections, id],
          )
        }
      />
      <span className="coach-section-order">{index < 0 ? "—" : index + 1}</span>
      <div>
        <strong>{t(meta.title)}</strong>
        <small>{t(state.ok ? meta.description : (state.reason ?? ""))}</small>
      </div>
      {checked && (
        <span className="coach-order-buttons">
          <button
            type="button"
            disabled={index <= 1}
            aria-label={t("เลื่อน {title} ขึ้น", { title: t(meta.title) })}
            onClick={() => {
              const n = [...options.sections];
              [n[index - 1], n[index]] = [n[index], n[index - 1]];
              setSections(n);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={
              index === options.sections.length - 1 || id === "overview"
            }
            aria-label={t("เลื่อน {title} ลง", { title: t(meta.title) })}
            onClick={() => {
              const n = [...options.sections];
              [n[index], n[index + 1]] = [n[index + 1], n[index]];
              setSections(n);
            }}
          >
            ↓
          </button>
        </span>
      )}
    </div>
  );
}
function SpecificOptions({
  options,
  setOptions,
  heatmap,
  loading,
  players,
  totalRounds,
}: {
  options: CoachExportOptions;
  setOptions: React.Dispatch<React.SetStateAction<CoachExportOptions>>;
  heatmap?: Awaited<ReturnType<typeof api.heatmap>>;
  loading: boolean;
  players: {
    steam_id: string;
    name: string;
  }[];
  totalRounds: number;
}) {
  const { t } = useT();
  const h = options.heatmap,
    e = options.economy;
  const sh = (x: Partial<typeof h>) =>
    setOptions((o) => ({ ...o, heatmap: { ...o.heatmap, ...x } }));
  const se = (x: Partial<typeof e>) =>
    setOptions((o) => ({ ...o, economy: { ...o.economy, ...x } }));
  return (
    <aside className="coach-specific-options">
      {options.sections.includes("heatmap") && (
        <section>
          <h3>{t("ตัวเลือก Heatmap")}</h3>
          <div className="coach-option-grid">
            <label>
              {t("ประเภท")}
              <select
                value={h.event}
                onChange={(x) => sh({ event: x.target.value as HeatEvent })}
              >
                {[
                  "kills",
                  "deaths",
                  "positions",
                  "smoke",
                  "flash",
                  "he",
                  "molotov",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              {t("ทีม")}
              <select
                value={h.team}
                onChange={(x) => sh({ team: x.target.value as typeof h.team })}
              >
                <option value="all">{t("ทั้งสองทีม")}</option>
                <option value="ours">{t("ทีมเรา")}</option>
                <option value="opponent">{t("คู่แข่ง")}</option>
              </select>
            </label>
            <label>
              {t("ฝั่ง")}
              <select
                value={h.side}
                onChange={(x) => sh({ side: x.target.value as typeof h.side })}
              >
                <option value="all">{t("ทั้งสองฝั่ง")}</option>
                <option value="ct">CT</option>
                <option value="t">T</option>
              </select>
            </label>
            <label>
              {t("ช่วงรอบ")}
              <select
                value={h.roundPreset}
                onChange={(x) =>
                  sh({ roundPreset: x.target.value as typeof h.roundPreset })
                }
              >
                <option value="all">{t("ทุกรอบ")}</option>
                <option value="first">{t("ครึ่งแรก")}</option>
                <option value="second">{t("ครึ่งหลัง")}</option>
                <option value="custom">{t("เลือกรอบเอง")}</option>
              </select>
            </label>
            {h.roundPreset === "custom" && (
              <label>
                {t("เลขรอบ")}
                <input
                  value={h.customRounds}
                  name="custom-rounds"
                  placeholder="1, 3, 5…"
                  onChange={(x) => sh({ customRounds: x.target.value })}
                />
              </label>
            )}
          </div>
          <fieldset className="coach-player-picks">
            <legend>{t("ผู้เล่น (ไม่เลือก = ทุกคน)")}</legend>
            {players.map((p) => (
              <label key={p.steam_id}>
                <input
                  type="checkbox"
                  checked={h.players.includes(p.steam_id)}
                  onChange={(x) =>
                    sh({
                      players: x.target.checked
                        ? [...h.players, p.steam_id]
                        : h.players.filter((id) => id !== p.steam_id),
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </fieldset>
          <div className="coach-range-grid">
            <label>
              Radius {h.radius}
              <input
                type="range"
                min="4"
                max="40"
                value={h.radius}
                onChange={(x) => sh({ radius: +x.target.value })}
              />
            </label>
            <label>
              Blur {h.blur}
              <input
                type="range"
                min="2"
                max="40"
                value={h.blur}
                onChange={(x) => sh({ blur: +x.target.value })}
              />
            </label>
            <label>
              Opacity {Math.round(h.opacity * 100)}%
              <input
                type="range"
                min=".2"
                max="1"
                step=".05"
                value={h.opacity}
                onChange={(x) => sh({ opacity: +x.target.value })}
              />
            </label>
          </div>
          <div className="coach-heat-preview">
            {loading ? (
              <span>{t("กำลังสร้าง preview…")}</span>
            ) : heatmap ? (
              <>
                <img src={heatmap.radar.image} alt={`Radar ${heatmap.map}`} />
                <svg
                  viewBox={`0 0 ${heatmap.radar.size} ${heatmap.radar.size}`}
                  style={{ opacity: h.opacity }}
                >
                  {heatmap.points.slice(0, 2500).map(([x, y], i) => (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={h.radius}
                      fill="#ff4d28"
                      opacity={Math.min(0.38, 0.08 + h.blur / 150)}
                    />
                  ))}
                </svg>
                <b>
                  {heatmap.event} ·{" "}
                  {t("{n} จุด", { n: heatmap.count.toLocaleString() })}
                </b>
              </>
            ) : (
              <span>{t("ไม่มีข้อมูลสำหรับตัวกรองนี้")}</span>
            )}
          </div>
        </section>
      )}
      {options.sections.includes("economy") && (
        <section>
          <h3>{t("ตัวเลือก Economy")}</h3>
          <div className="coach-option-grid">
            <label>
              {t("ทีม")}
              <select
                value={e.team}
                onChange={(x) => se({ team: x.target.value as typeof e.team })}
              >
                <option value="all">{t("ทั้งสองทีม")}</option>
                <option value="ours">{t("ทีมเรา")}</option>
                <option value="opponent">{t("คู่แข่ง")}</option>
              </select>
            </label>
            <label>
              {t("ตั้งแต่รอบ")}
              <input
                type="number"
                min="1"
                max={totalRounds}
                value={e.fromRound}
                onChange={(x) => se({ fromRound: +x.target.value })}
              />
            </label>
            <label>
              {t("ถึงรอบ")}
              <input
                type="number"
                min="1"
                max={totalRounds}
                value={Math.min(e.toRound, totalRounds || 99)}
                onChange={(x) => se({ toRound: +x.target.value })}
              />
            </label>
          </div>
          <div className="coach-inline-checks">
            <label>
              <input
                type="checkbox"
                checked={e.showChart}
                onChange={(x) => se({ showChart: x.target.checked })}
              />
              {t("กราฟมูลค่าอุปกรณ์")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={e.showBuyTypes}
                onChange={(x) => se({ showBuyTypes: x.target.checked })}
              />
              {t("ประเภทการซื้อ")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={e.showTable}
                onChange={(x) => se({ showTable: x.target.checked })}
              />
              {t("ตารางตัวเลข")}
            </label>
          </div>
        </section>
      )}
    </aside>
  );
}
