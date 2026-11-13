import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { api, matchesQuery, type HeatEvent, type MatchHeatmap, type HeatmapCells } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { useViewportFit } from "@/shared/ui/useViewportFit";
import { Breadcrumb, MapThumb, MatchTabs, NADE_ICON, NotFound, num } from "@/shared/ui/utils";

// ================================================================================================
// ================================================================================================
/**
 *
 *
 */
type Side = "all" | "ct" | "t";

const EVENTS: { key: HeatEvent; label: string; who: string; group: "คน" | "ระเบิด" }[] = [
  { key: "kills", label: "คิล", who: "ตำแหน่งคนยิงตอนยิงคู่แข่งตาย", group: "คน" },
  { key: "deaths", label: "ตาย", who: "ตำแหน่งที่ผู้เล่นตาย", group: "คน" },
  { key: "positions", label: "ยืน", who: "ตำแหน่งผู้เล่นที่ยังมีชีวิตจากข้อมูลที่บันทึก", group: "คน" },
  { key: "smoke", label: "สโมค", who: "จุดที่สโมคแตก", group: "ระเบิด" },
  { key: "flash", label: "แฟลช", who: "จุดที่แฟลชแตก", group: "ระเบิด" },
  { key: "he", label: "HE", who: "จุดที่ HE แตก", group: "ระเบิด" },
  { key: "molotov", label: "โมโลตอฟ", who: "จุดที่โมโลตอฟตก", group: "ระเบิด" },
];
const SIDES: { key: Side; label: string }[] = [
  { key: "all", label: "ทั้งสองฝั่ง" },
  { key: "ct", label: "CT" },
  { key: "t", label: "T" },
];
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** MR12 regulation, then one six-round block per overtime; the final block may be shorter. */
function roundPresets(total: number) {
  const presets: { key: string; label: string; rounds: number[] | null }[] = [
    { key: "all", label: "ทุกรอบ", rounds: null },
  ];
  if (total > 0) presets.push({ key: "first_half", label: "ครึ่งแรก", rounds: range(1, Math.min(12, total)) });
  if (total > 12) presets.push({ key: "second_half", label: "ครึ่งหลัง", rounds: range(13, Math.min(24, total)) });
  if (total > 24) presets.push({ key: "ot", label: "OT", rounds: range(25, total) });
  return presets;
}

function selectedRound(raw: string | null, legacyHalf: string | null, total: number, presets: ReturnType<typeof roundPresets>): string {
  if (raw === null) raw = ({ "1": "first_half", "2": "second_half", ot: "ot" } as Record<string, string>)[legacyHalf ?? ""] ?? "all";
  if (raw === "ot_all") raw = "ot";
  if (presets.some((preset) => preset.key === raw)) return raw;
  const n = Number(raw);
  return /^\d+$/.test(raw) && Number.isInteger(n) && n >= 1 && n <= total ? String(n) : "all";
}

export function HeatmapPage() {
  const { t } = useT();
  const { demo } = useParams();
  const matches = useQuery(matchesQuery);
  const entry = demo ? (matches.data ?? []).find((m) => m.demo_file === demo) : undefined;

  if (matches.error) return <p className="err">{t("โหลดรายการแมตช์ไม่ได้: {msg}", { msg: (matches.error as Error).message })}</p>;
  if (!matches.data) return <p className="muted">{t("กำลังโหลด…")}</p>;
  if (!entry) return <NotFound title={t("ไม่พบแมตช์นี้")} detail={t("ไม่มีแมตช์ {demo} ในระบบ", { demo: demo ?? "" })} />;
  if (entry.status !== "done") return <Navigate to={`/matches/${encodeURIComponent(entry.demo_file)}`} replace />;

  return <HeatmapBody demo={entry.demo_file} totalRounds={entry.rounds} />;
}

function HeatmapBody({ demo, totalRounds }: { demo: string; totalRounds: number }) {
  const { t } = useT();
  const viewportRef = useViewportFit();
  const [params, setParams] = useSearchParams();
  const ev = (EVENTS.find((e) => e.key === params.get("ev"))?.key ?? "kills") as HeatEvent;
  const side = (SIDES.find((s) => s.key === params.get("side"))?.key ?? "all") as Side;
  const presets = roundPresets(totalRounds);
  const round = selectedRound(params.get("round"), params.get("half"), totalRounds, presets);
  const put = (key: string, value: string, fallback: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === fallback) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  const putRound = (value: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("round", value);
    next.delete("half");
    return next;
  }, { replace: true });

  const [players, setPlayers] = useState<string[] | null>(null);
  const [radius, setRadius] = useState(22);
  const [blur, setBlur] = useState(18);
  const [opacity, setOpacity] = useState(0.85);
  const rounds = presets.find((preset) => preset.key === round)?.rounds ?? (round === "all" ? null : [Number(round)]);
  const none = players !== null && players.length === 0;

  const q = useQuery({
    queryKey: ["heatmap", demo, ev, side, players?.join(",") ?? null, rounds?.join(",") ?? null],
    queryFn: () => api.heatmap(demo, ev, side, players, rounds),
    enabled: !none,
    placeholderData: keepPreviousData, // เปลี่ยนตัวกรองแล้วแผนที่ไม่กระพริบหาย
    staleTime: 5 * 60_000,
  });
  const lastRoster = useRef<MatchHeatmap["roster"]>([]);
  if (q.data) lastRoster.current = q.data.roster;
  const roster = lastRoster.current;
  const teams = useMemo(() => {
    const byTeam = new Map<string, string[]>();
    roster.forEach((p) => {
      const tm = p.team ?? "ไม่ทราบทีม";
      byTeam.set(tm, [...(byTeam.get(tm) ?? []), p.steam_id]);
    });
    return [...byTeam];
  }, [roster]);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const activeTeam = players === null ? "all" : (teams.find(([, ids]) => sameSet(ids, players))?.[0] ?? null);

  const playerOn = (id: string) => players === null || players.includes(id);
  const togglePlayer = (id: string) => {
    const base = players ?? roster.map((p) => p.steam_id);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    setPlayers(next.length === roster.length ? null : next);
  };

  const data = q.data;
  const currentData = q.isPlaceholderData && !none ? null : data;
  const empty = none || (currentData?.count === 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = useMemo<HeatmapCells>(() => {
    if (empty || q.isPlaceholderData) return { n: 32, unit: data?.cells?.unit ?? "events", cells: [], max: 0 };
    if (data?.cells) return data.cells;
    const counts = new Map<string, [number, number, number]>();
    for (const [x, y] of data?.points ?? []) {
      const cx = Math.min(31, Math.max(0, Math.floor(x * 32 / data!.radar.size)));
      const cy = Math.min(31, Math.max(0, Math.floor(y * 32 / data!.radar.size)));
      const key = `${cx},${cy}`;
      const cell = counts.get(key) ?? [cx, cy, 0];
      cell[2] += 1;
      counts.set(key, cell);
    }
    const values = [...counts.values()];
    return { n: 32, unit: ev === "positions" ? "samples" : "events", cells: values, max: Math.max(0, ...values.map(cell => cell[2])) };
  }, [data, ev, empty, q.isPlaceholderData]);
  const unit = t(cells.unit === "player_seconds" ? "คน·วินาทีโดยประมาณ" : cells.unit === "samples" ? "จุดที่บันทึก" : ev === "kills" ? "คิล" : ev === "deaths" ? "การตาย" : "ระเบิด");

  return (
    <div className="heat-page" data-testid="heatmap-page">
      <Breadcrumb items={[{ label: t("แมตช์"), to: "/matches" }, { label: demo }]} />
      <div className="page-head mt-head">
        <MapThumb map={data?.map} className="mh-thumb" />
        <div>
          <h1>{data?.map ?? "…"} · {t("{n} รอบ", { n: num(totalRounds) })}</h1>
        </div>
      </div>
      <MatchTabs demo={demo} />

      <div className="heat-grid" ref={viewportRef}>
        <section className="heat-map-col" aria-label={t("แผนที่ heatmap")}>
          <div className="heat-map">
            {q.error ? (
              <p className="err">{t("โหลดข้อมูลไม่ได้: {msg}", { msg: (q.error as Error).message })}</p>
            ) : data ? (
              <>
                <HeatCanvas data={data} points={empty || q.isPlaceholderData ? [] : data.points} radius={radius} blur={blur}
                  opacity={opacity} canvasRef={canvasRef} cells={cells} unit={unit} />
                {empty && <div className="heat-empty" role="status">
                  {t(none ? "ยังไม่ได้เลือกผู้เล่น" : "ไม่พบข้อมูลในรอบที่เลือก")}
                </div>}
                {q.isPlaceholderData && !none && <div className="heat-empty" role="status">{t("กำลังอัปเดต…")}</div>}
              </>
            ) : none ? (
              <p className="muted">{t("ยังไม่ได้เลือกผู้เล่น")}</p>
            ) : (
              <p className="muted">{t("กำลังโหลด…")}</p>
            )}
          </div>
          <div className="heat-foot">
            <span className="heat-key">
              <span>{t("น้อย")}</span><i /><span>{t("มาก")}</span>
            </span>
          </div>
        </section>

        <aside className="card heat-panel" aria-label={t("ตัวเลือก heatmap")}>
          <fieldset className="hp-field">
            <legend>{t("ดูอะไร")}</legend>
            {(["คน", "ระเบิด"] as const).map((g) => (
              <div className="seg" role="group" aria-label={t(g)} key={g}>
                {EVENTS.filter((e) => e.group === g).map((e) => (
                  <button key={e.key} type="button" className={`seg-btn${ev === e.key ? " on" : ""}`}
                    aria-pressed={ev === e.key} onClick={() => put("ev", e.key, "kills")} data-testid={`hm-ev-${e.key}`}>
                    {NADE_ICON[e.key] && <img className="nade-ico" src={NADE_ICON[e.key]} alt="" />}
                    {t(e.label)}
                  </button>
                ))}
              </div>
            ))}
          </fieldset>

          <fieldset className="hp-field">
            <legend>{t("ฝั่ง · ช่วงเกม")}</legend>
            <div className="seg" role="group" aria-label={t("ฝั่ง")}>
              {SIDES.map((s) => (
                <button key={s.key} type="button" className={`seg-btn${side === s.key ? " on" : ""}`}
                  aria-pressed={side === s.key} onClick={() => put("side", s.key, "all")}>
                  {t(s.label)}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label={t("ช่วงเกม")}>
              {presets.map((preset) => (
                <button key={preset.key} type="button" className={`seg-btn${round === preset.key ? " on" : ""}`}
                  aria-pressed={round === preset.key} onClick={() => putRound(preset.key)}>
                  {t(preset.label)}
                </button>
              ))}
            </div>
            <div className="hm-round-grid" role="group" aria-label={t("เลือกรอบเดียว")}>
              {range(1, totalRounds).map((n) => (
                <button key={n} type="button" className={`seg-btn hm-round-btn${round === String(n) ? " on" : ""}`}
                  aria-label={t("รอบ {n}", { n })} aria-pressed={round === String(n)} onClick={() => putRound(String(n))}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="hp-field">
            <legend>{t("ทีม")}</legend>
            <div className="seg" role="group" aria-label={t("ทีม")}>
              <button type="button" className={`seg-btn${activeTeam === "all" ? " on" : ""}`}
                aria-pressed={activeTeam === "all"} onClick={() => setPlayers(null)}>
                {t("ทุกทีม")}
              </button>
              {teams.map(([team, ids]) => (
                <button key={team} type="button" className={`seg-btn${activeTeam === team ? " on" : ""}`}
                  aria-pressed={activeTeam === team} onClick={() => setPlayers(ids)}>
                  {team === "ไม่ทราบทีม" ? t(team) : team}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="hp-field">
            <legend className="hp-legend-row">
              <span>{t("ผู้เล่น")}</span>
              <span className="hm-quick">
                <button type="button" className="link-btn" onClick={() => setPlayers(null)}>{t("ทั้งหมด")}</button>
                {" · "}
                <button type="button" className="link-btn" onClick={() => setPlayers([])}>{t("ไม่เอาเลย")}</button>
              </span>
            </legend>
            {teams.map(([team, ids]) => <div className="hm-player-team" key={team}>
              <strong>{team === "ไม่ทราบทีม" ? t(team) : team}</strong>
              <div className="hm-pills" role="group" aria-label={team}>
              {roster.filter((p) => ids.includes(p.steam_id)).map((p) => (
                <button key={p.steam_id} type="button"
                  className={`hm-pill${playerOn(p.steam_id) ? ` ${p.start_side ?? ""} on` : ""}`}
                  aria-pressed={playerOn(p.steam_id)} onClick={() => togglePlayer(p.steam_id)}>
                  {p.name}
                </button>
              ))}
              </div>
            </div>)}
            {none && <p className="muted small hp-note">{t('ยังไม่ได้เลือกใคร — กดชื่อผู้เล่น หรือ "ทั้งหมด"')}</p>}
          </fieldset>

          <fieldset className="hp-field">
            <legend>{t("การแสดงผล")}</legend>
            <Slider label={t("รัศมี")} value={radius} min={6} max={60} step={1} onChange={setRadius} />
            <Slider label={t("ความเบลอ")} value={blur} min={0} max={40} step={1} onChange={setBlur} />
            <Slider label={t("ความทึบ")} value={opacity} min={0.15} max={1} step={0.05} onChange={setOpacity}
              format={(v) => `${Math.round(v * 100)}%`} />
          </fieldset>


        </aside>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="hp-slider">
      <span className="hp-slider-h"><span>{label}</span><span className="muted">{format ? format(value) : value}</span></span>
      <input name={`heatmap-${label}`} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

// ================================================================================================
// ================================================================================================
/**
 */
const RAMP: [number, string][] = [
  [0.0, "#1432ff"], [0.3, "#00b4ff"], [0.5, "#1fe07a"], [0.7, "#ffe600"], [0.85, "#ff8a00"], [1.0, "#ff1e1e"],
];

let palette: Uint8ClampedArray | null = null;
function getPalette(): Uint8ClampedArray {
  if (palette) return palette;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  RAMP.forEach(([at, col]) => grad.addColorStop(at, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 1);
  palette = g.getImageData(0, 0, 256, 1).data;
  return palette;
}

function drawHeat(canvas: HTMLCanvasElement, size: number, points: [number, number][], radius: number, blur: number) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, size, size);
  if (points.length === 0) return;

  const r2 = radius + blur;
  const stamp = document.createElement("canvas");
  stamp.width = stamp.height = r2 * 2;
  const s = stamp.getContext("2d")!;
  s.shadowOffsetX = s.shadowOffsetY = r2 * 2;
  s.shadowBlur = blur;
  s.shadowColor = "black";
  s.beginPath();
  s.arc(-r2, -r2, radius, 0, Math.PI * 2);
  s.fill();

  const cell = Math.max(4, radius);
  const bins = new Map<number, number>();
  let peak = 1;
  for (const [x, y] of points) {
    const k = Math.floor(x / cell) * 4096 + Math.floor(y / cell);
    const n = (bins.get(k) ?? 0) + 1;
    bins.set(k, n);
    if (n > peak) peak = n;
  }
  ctx.globalAlpha = Math.min(1, Math.max(0.012, 1.8 / peak));
  for (const [x, y] of points) ctx.drawImage(stamp, x - r2, y - r2);

  const img = ctx.getImageData(0, 0, size, size);
  const px = img.data;
  const pal = getPalette();
  for (let i = 3; i < px.length; i += 4) {
    const a = px[i];
    if (a < 3) {
      px[i] = 0;
      continue;
    }
    const j = a * 4;
    px[i - 3] = pal[j];
    px[i - 2] = pal[j + 1];
    px[i - 1] = pal[j + 2];
    px[i] = Math.min(255, 70 + a * 1.4); // ส่วนบาง ๆ ยังเห็นเป็นฟ้าจาง ไม่หายไปกับพื้น
  }
  ctx.putImageData(img, 0, 0);
}

const MAX_Z = 6;

function HeatCanvas({ data, points, radius, blur, opacity, canvasRef, cells, unit }: {
  data: MatchHeatmap;
  points: [number, number][];
  radius: number;
  blur: number;
  opacity: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cells: HeatmapCells;
  unit: string;
}) {
  const { t } = useT();
  const size = data.radar.size;
  useLayoutEffect(() => {
    if (canvasRef.current) drawHeat(canvasRef.current, size, points, radius, blur);
  }, [points, radius, blur, size, canvasRef]);

  const [view, setView] = useState({ z: 1, tx: 0, ty: 0 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const values = useMemo(() => new Map(cells.cells.map(([x, y, value]) => [y * cells.n + x, value])), [cells]);
  const [hover, setHover] = useState<{
    left: number; top: number; pointerX: number; pointerY: number; mapX: number; mapY: number;
    value: number; cells: HeatmapCells; view: typeof view;
  } | null>(null);
  const tooltip = hover?.cells === cells && hover.view === view ? hover : null;
  const inspect = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const container = box.current;
    if (!canvas || !container || points.length === 0) { setHover(null); return; }
    const radar = canvas.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    const mapX = (clientX - radar.left) / radar.width * size;
    const mapY = (clientY - radar.top) / radar.height * size;
    if (mapX < 0 || mapY < 0 || mapX >= size || mapY >= size) { setHover(null); return; }
    const x = Math.floor(mapX / size * cells.n);
    const y = Math.floor(mapY / size * cells.n);
    const pointerX = clientX - bounds.left;
    const pointerY = clientY - bounds.top;
    setHover({ mapX, mapY, pointerX, pointerY,
      left: Math.max(8, Math.min(pointerX + 14, bounds.width - 228)),
      top: Math.max(8, Math.min(pointerY + 14, bounds.height - 128)),
      value: values.get(y * cells.n + x) ?? 0, cells, view });
  };
  const clamp = (z: number, tx: number, ty: number) => {
    const lim = 1 - z; // เลื่อนได้ไม่เกินขอบภาพ
    return { z, tx: Math.min(0, Math.max(lim, tx)), ty: Math.min(0, Math.max(lim, ty)) };
  };
  const zoomAt = (factor: number, cx = 0.5, cy = 0.5) =>
    setView((v) => {
      const z = Math.min(MAX_Z, Math.max(1, v.z * factor));
      if (z === 1) return { z: 1, tx: 0, ty: 0 };
      const k = z / v.z; // จุดใต้เมาส์อยู่ที่เดิมหลังซูม
      return clamp(z, cx - (cx - v.tx) * k, cy - (cy - v.ty) * k);
    });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // ไม่ให้ทั้งหน้าเลื่อนตอนหมุนล้อบนแผนที่
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      className={`heat-box${view.z > 1 ? " zoomed" : ""}`}
      ref={box}
      onPointerDown={(e) => {
        if ((e.target as Element).closest("button")) return;
        if (view.z <= 1) { inspect(e.clientX, e.clientY); return; }
        if (e.button !== 0) return;
        setHover(null);
        drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) {
          if ((e.target as Element).closest("button")) setHover(null);
          else inspect(e.clientX, e.clientY);
          return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        setView((v) => clamp(v.z, d.tx + (e.clientX - d.x) / r.width, d.ty + (e.clientY - d.y) / r.height));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (e.pointerType === "touch" && (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4)) inspect(e.clientX, e.clientY);
      }}
      onPointerCancel={() => { drag.current = null; setHover(null); }}
      onPointerLeave={(e) => { if (e.pointerType !== "touch") setHover(null); }}
      data-testid="heatmap-box"
    >
      <div className="heat-stage" style={{ transform: `translate(${view.tx * 100}%, ${view.ty * 100}%) scale(${view.z})` }}>
        <img src={data.radar.image} alt={t("ภาพเรดาร์ {map}", { map: data.radar.map })} draggable={false} />
        <canvas ref={canvasRef} style={{ opacity }} data-testid="heatmap-canvas" tabIndex={0} role="img"
          aria-label={t("แผนที่ความหนาแน่น ใช้ปุ่มลูกศรเพื่อดูค่าในบริเวณต่าง ๆ")}
          aria-describedby={tooltip ? "heatmap-value-tooltip" : undefined}
          onFocus={(e) => {
            if (!e.currentTarget.matches(":focus-visible")) return;
            const r = box.current?.getBoundingClientRect();
            if (r) inspect(r.left + r.width / 2, r.top + r.height / 2);
          }}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setHover(null); return; }
            const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (!delta[e.key]) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const [dx, dy] = delta[e.key];
            const mapX = Math.max(0.5, Math.min(size - 0.5, (tooltip?.mapX ?? size / 2) + dx * size / cells.n));
            const mapY = Math.max(0.5, Math.min(size - 0.5, (tooltip?.mapY ?? size / 2) + dy * size / cells.n));
            const bounds = box.current!.getBoundingClientRect();
            inspect(Math.max(bounds.left + 1, Math.min(bounds.right - 1, r.left + mapX / size * r.width)),
              Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, r.top + mapY / size * r.height)));
          }} />
      </div>
      {tooltip && <>
        <span className="heat-inspection-point" aria-hidden="true" style={{ left: tooltip.pointerX, top: tooltip.pointerY }} />
        <div id="heatmap-value-tooltip" role="tooltip" className="heat-density-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          <span>{t("บริเวณที่ชี้")}</span>
          <strong>{tooltip.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}</strong>
          <small>{t("พื้นที่ {size} × {size} px บนภาพแผนที่", { size: size / cells.n })}</small>
        </div>
      </>}
      <div className="map-zoom" role="group" aria-label={t("ซูมแผนที่")}>
        <button type="button" onClick={() => zoomAt(1.4)} disabled={view.z >= MAX_Z} aria-label={t("ซูมเข้า")}
          title={t("ซูมเข้า (หรือหมุนล้อเมาส์บนแผนที่)")}>+</button>
        <button type="button" onClick={() => zoomAt(1 / 1.4)} disabled={view.z <= 1} aria-label={t("ซูมออก")} title={t("ซูมออก")}>−</button>
        {view.z > 1 && (
          <button type="button" className="mz-reset" onClick={() => setView({ z: 1, tx: 0, ty: 0 })}>{t("เต็มแมพ")}</button>
        )}
      </div>
    </div>
  );
}

