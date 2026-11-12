import { useCallback, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import type { ReviewTeam, Side } from "@/shared/api";
import { tr, useT } from "@/shared/i18n";
import heIcon from "@/features/rounds/assets/grenades/he.png";
import flashIcon from "@/features/rounds/assets/grenades/flash.png";
import molotovIcon from "@/features/rounds/assets/grenades/molotov.png";
import smokeIcon from "@/features/rounds/assets/grenades/smoke.png";

// ================================================================================================
// ================================================================================================

/** 23.4 -> "0:23" */
export function fmtT(t: number | null | undefined): string {
  if (t == null) return "—";
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export const sideLabel = (s: string | null | undefined) => (s === "ct" ? "CT" : s === "t" ? "T" : "?");

const WEAPONS: Record<string, string> = {
  ak47: "AK-47", m4a1: "M4A4", m4a1_silencer: "M4A1-S", awp: "AWP", ssg08: "SSG 08", deagle: "Desert Eagle",
  usp_silencer: "USP-S", glock: "Glock-18", hkp2000: "P2000", p250: "P250", tec9: "Tec-9", fiveseven: "Five-SeveN",
  cz75a: "CZ75-Auto", galilar: "Galil AR", famas: "FAMAS", mp9: "MP9", mac10: "MAC-10", mp7: "MP7", ump45: "UMP-45",
  p90: "P90", sg556: "SG 553", aug: "AUG", hegrenade: "HE", inferno: "Molotov", knife: "มีด", world: "ตกที่สูง",
  planted_c4: "C4",
};
export const weaponLabel = (w: string | null | undefined) => (w ? tr(WEAPONS[w] ?? w) : "—");

export const END_REASON: Record<string, string> = {
  ct_killed: "ฆ่า CT หมดทีม",
  t_killed: "ฆ่า T หมดทีม",
  bomb_exploded: "ระเบิดลง",
  bomb_defused: "กู้ระเบิดสำเร็จ",
  time_ran_out: "หมดเวลา",
  ct_win: "CT ชนะ",
  t_win: "T ชนะ",
};
export const endReasonLabel = (r: string | null | undefined) => (r ? tr(END_REASON[r] ?? r) : "—");

// ================================================================================================
// ================================================================================================
export function playerNumbers(teams: ReviewTeam[]): Map<string, number> {
  const m = new Map<string, number>();
  teams.forEach((t) => t.players.forEach((p, i) => m.set(p.steamid, i + 1)));
  return m;
}

// ================================================================================================
// ================================================================================================
/**
 */
export const DEATH_RAMP: Record<"all" | Side, readonly string[]> = {
  ct: ["#DBEAFE", "#93C5FD", "#3B82F6", "#1D4ED8", "#1E3A8A"],
  t: ["#FFEDD5", "#FDBA74", "#F97316", "#C2410C", "#7C2D12"],
  all: ["#FFE4E6", "#FCA5A5", "#EF4444", "#B91C3C", "#7F1D1D"],
};

/**
 */
export const DIFF_FILL = {
  "-2": "#2DD4BF", // ตายน้อยกว่าชุดอ้างอิงมาก
  "-1": "#0D9488",
  "1": "#B91C3C",
  "2": "#FB7185", // ตายบ่อยกว่าชุดอ้างอิงมาก
} as const;
export type DiffLevel = -2 | -1 | 0 | 1 | 2;
export const DIFF_STEPS = { near: 1.3, far: 2 } as const;
/**
 */
export const RATIO_RAMP = ["#FDE047", "#FB923C", "#DC2626"] as const;
export const DIFF_MIN_DEATHS = 3;

export function diffLevel(shareMine: number, shareRef: number, deathsMine: number): DiffLevel {
  if (deathsMine < DIFF_MIN_DEATHS) return 0;
  const ratio = shareRef > 0 ? shareMine / shareRef : Infinity;
  if (ratio >= DIFF_STEPS.far) return 2;
  if (ratio >= DIFF_STEPS.near) return 1;
  if (ratio <= 1 / DIFF_STEPS.far) return -2;
  if (ratio <= 1 / DIFF_STEPS.near) return -1;
  return 0;
}

const PLAYER_FILL: Record<string, string> = { ct: "#2563c9", t: "#f0891c" };
const PLAYER_INK: Record<string, string> = { ct: "#ffffff", t: "#20160a" };
export const playerFill = (side: string | null | undefined) => PLAYER_FILL[side ?? ""] ?? "#94a3b8";
export const playerInk = (side: string | null | undefined) => PLAYER_INK[side ?? ""] ?? "#20160a";

const NADE_LABEL: Record<string, string> = { smoke: "สโมค", flash: "แฟลช", he: "HE", molotov: "โมโลตอฟ", decoy: "ดีคอย" };
export const NADE_COLOR: Record<string, string> = {
  smoke: "#cbd5e1", flash: "#fde047", he: "#f87171", molotov: "#fb923c", decoy: "#a78bfa",
};
export const NADE_ICON: Record<string, string> = { smoke: smokeIcon, flash: flashIcon, he: heIcon, molotov: molotovIcon };

// ================================================================================================
// ================================================================================================
export function MapThumb({ map, className = "" }: { map: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!map || broken) return <span className={`map-thumb ph ${className}`} aria-hidden="true" />;
  return (
    <img className={`map-thumb ${className}`} src={`/assets/thumbs/${map}.webp`} alt="" loading="lazy"
      decoding="async" onError={() => setBroken(true)} />
  );
}
export const nadeLabel = (t: string) => tr(NADE_LABEL[t] ?? t);
export const NADE_TYPES = ["smoke", "flash", "he", "molotov", "decoy"] as const;
export type NadeType = (typeof NADE_TYPES)[number];

export const matchTitle = (m: { team_a: string | null; team_b: string | null; demo_file: string }) =>
  m.team_a && m.team_b ? `${m.team_a} vs ${m.team_b}` : m.demo_file;

export const num = (n: number) => n.toLocaleString("th-TH");

export const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// ================================================================================================
// ================================================================================================
/**
 */
export interface ViewState {
  nades: NadeType[]; // g=smoke,flash  ชนิดระเบิดที่แสดง (ไม่มี g = แสดงครบ, g=none = ไม่แสดงเลย)
  zoom: number; // z=2.5     ซูมแผนที่ (1 = เต็มแมพ)
  center: [number, number] | null; // c=x,y  จุดกึ่งกลางที่มองอยู่ (หน่วยพิกเซลของภาพเรดาร์)
  playback: boolean; // ไม่มี pb หรือ pb=1 = เล่นย้อน, pb=0 = ภาพสรุปทั้งรอบ
  time: number | null; // t=12.5   วินาทีในรอบที่ดูค้างไว้
  player: string | null; // p=<steamid> ไฮไลต์ผู้เล่น
  death: number | null; // d=<ลำดับ>  การตายที่เลือก
}

export const MAX_ZOOM = 5;

function parseNades(raw: string | null): NadeType[] {
  if (raw === null) return [...NADE_TYPES];
  if (raw === "none" || raw === "0") return [];
  const picked = raw.split(",").filter((t): t is NadeType => (NADE_TYPES as readonly string[]).includes(t));
  return picked.length ? picked : [...NADE_TYPES];
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(1, Number.isFinite(z) ? z : 1));

function parseCenter(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length !== 2 || parts.some((part) => part.trim() === "")) return null;
  const [x, y] = parts.map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

export function useViewState() {
  const [params, setParams] = useSearchParams();
  const d = Number(params.get("d"));
  const state: ViewState = {
    nades: parseNades(params.get("g")),
    zoom: clampZoom(Number(params.get("z")) || 1),
    center: parseCenter(params.get("c")),
    playback: params.get("pb") !== "0",
    time: params.get("t") !== null && Number.isFinite(Number(params.get("t"))) ? Number(params.get("t")) : null,
    player: params.get("p"),
    death: params.get("d") && Number.isInteger(d) && d > 0 ? d : null,
  };

  const update = useCallback(
    (patch: Partial<ViewState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const put = (key: string, value: string | null) => (value === null ? next.delete(key) : next.set(key, value));
          if ("nades" in patch) {
            const list = patch.nades ?? [];
            put("g", list.length === NADE_TYPES.length ? null : list.length === 0 ? "none" : list.join(","));
          }
          if ("zoom" in patch) put("z", !patch.zoom || patch.zoom <= 1.01 ? null : String(Number(patch.zoom.toFixed(4))));
          if ("center" in patch) put("c", patch.center ? patch.center.map((v) => Number(v.toFixed(2))).join(",") : null);
          if ("playback" in patch) put("pb", patch.playback ? null : "0");
          if ("time" in patch) put("t", patch.time == null ? null : patch.time.toFixed(1));
          if ("player" in patch) put("p", patch.player ?? null);
          if ("death" in patch) put("d", patch.death == null ? null : String(patch.death));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [state, update, params] as const;
}

/**
 */
export function roundUrl(demo: string, round: number, params?: URLSearchParams, drop: string[] = []): string {
  const q = new URLSearchParams(params);
  drop.forEach((k) => q.delete(k));
  const s = q.toString();
  return `/matches/${encodeURIComponent(demo)}/rounds/${round}${s ? `?${s}` : ""}`;
}

// ================================================================================================
// ================================================================================================
export interface Crumb {
  label: string;
  to?: string; // ไม่มี to = ระดับที่กำลังอยู่ (ไม่ใช่ลิงก์)
}

/**
 *
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useT();
  return (
    <nav className="crumbs" aria-label={t("เส้นทางหน้า")} data-testid="breadcrumb">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`}>
          {i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
          {c.to ? <Link to={c.to}>{t(c.label)}</Link> : <b aria-current="page">{t(c.label)}</b>}
        </span>
      ))}
    </nav>
  );
}

// ================================================================================================
// ================================================================================================
export function MatchTabs({ demo }: { demo: string }) {
  const { t } = useT();
  const base = `/matches/${encodeURIComponent(demo)}`;
  const tabs = [
    { to: base, label: "สกอร์บอร์ด", end: true },
    { to: `${base}/rounds/1`, label: "ดูทีละรอบ", end: false },
    { to: `${base}/heatmap`, label: "Heatmap", end: false },
    { to: `${base}/economy`, label: "เศรษฐกิจ", end: false },
  ];
  return (
    <nav className="an-tabs match-tabs" aria-label={t("มุมมองของแมตช์")} data-testid="match-tabs">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `an-tab${isActive ? " on" : ""}`}>
          {t(tab.label)}
        </NavLink>
      ))}
    </nav>
  );
}

// ================================================================================================
// ================================================================================================
export function NotFound({ title = "ไม่พบหน้านี้", detail }: { title?: string; detail?: string }) {
  const { t } = useT();
  return (
    <div className="notfound" data-testid="not-found">
      <p className="nf-code" aria-hidden="true">404</p>
      <h1>{t(title)}</h1>
      {detail && <p className="muted">{t(detail)}</p>}
      <Link className="btn-primary" to="/matches">
        {t("กลับไปหน้าแมตช์")}
      </Link>
    </div>
  );
}
