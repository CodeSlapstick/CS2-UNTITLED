import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  type OpeningRound,
  type OpeningRoutes,
  type Side,
} from "@/shared/api";
import { useT } from "@/shared/i18n";
import { useViewportFit } from "@/shared/ui/useViewportFit";
import { openingAt } from "./openingRoutePlayback";
import "./opening-route.css";

const SPEEDS = [0.5, 1, 2, 4] as const;

export function OpeningRoutePage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const catalog = useQuery({
    queryKey: ["opening-catalog"],
    queryFn: api.openingCatalog,
  });
  const players = useMemo(() => {
    const result = new Map<
      string,
      { id: string; name: string; matches: Set<number> }
    >();
    for (const row of catalog.data ?? []) {
      const player = result.get(row.steamid) ?? {
        id: row.steamid,
        name: row.name ?? "—",
        matches: new Set<number>(),
      };
      player.matches.add(row.id);
      result.set(row.steamid, player);
    }
    return [...result.values()].sort(
      (a, b) => b.matches.size - a.matches.size || a.name.localeCompare(b.name),
    );
  }, [catalog.data]);
  const player =
    players.find((p) => p.id === params.get("player")) ?? players[0];
  const maps = useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const row of catalog.data ?? []) {
      if (row.steamid !== player?.id || !row.map_name) continue;
      const ids = result.get(row.map_name) ?? new Set<number>();
      ids.add(row.id);
      result.set(row.map_name, ids);
    }
    return [...result.entries()].sort(
      (a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]),
    );
  }, [catalog.data, player?.id]);
  const map =
    maps.find(([name]) => name === params.get("map"))?.[0] ?? maps[0]?.[0];
  const side: Side = params.get("side") === "ct" ? "ct" : "t";
  const scope = [5, 10].includes(Number(params.get("scope")))
    ? Number(params.get("scope"))
    : 0;
  const routes = useQuery({
    queryKey: ["opening-routes", player?.id, map, side, scope],
    queryFn: () => api.openingRoutes(player!.id, map!, side, scope),
    enabled: !!player && !!map,
  });
  const selection = `${player?.id}:${map}:${side}:${scope}`;
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === "player") next.delete("map");
    setParams(next);
  }
  return (
    <section
      className={`opening-page${embedded ? " opening-page-embedded" : ""}`}
    >
      {!embedded && (
        <header className="opening-heading">
          <h1>Opening Route</h1>
        </header>
      )}
      <div className="opening-filters filters card">
        <label>
          {t("ผู้เล่น")}
          <select
            value={player?.id ?? ""}
            onChange={(e) => change("player", e.target.value)}
            disabled={!players.length}
          >
            {!players.length && <option value="">—</option>}
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {t("{n} แมตช์", { n: p.matches.size })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("แผนที่")}
          <select
            value={map ?? ""}
            onChange={(e) => change("map", e.target.value)}
            disabled={!maps.length}
          >
            {!maps.length && <option value="">—</option>}
            {maps.map(([name, ids]) => (
              <option key={name} value={name}>
                {name.replace("de_", "")} · {t("{n} แมตช์", { n: ids.size })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("ขอบเขต")}
          <select
            value={scope}
            onChange={(e) => change("scope", e.target.value)}
          >
            <option value={5}>{t("5 แมตช์ล่าสุด")}</option>
            <option value={10}>{t("10 แมตช์ล่าสุด")}</option>
            <option value={0}>{t("ทั้งหมด")}</option>
          </select>
        </label>
        <div
          className="opening-side"
          role="group"
          aria-label={t("ฝั่งของผู้เล่นในแต่ละรอบ")}
        >
          {(["t", "ct"] as const).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={s === side}
              className={s === side ? "btn-ghost active" : "btn-ghost"}
              onClick={() => change("side", s)}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {catalog.isError || routes.isError ? (
        <div className="card" role="alert">
          <p>{t("โหลด Opening Route ไม่สำเร็จ")}</p>
          <p className="muted">
            {String((catalog.error ?? routes.error)?.message ?? "")}
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void catalog.refetch();
              if (player && map) void routes.refetch();
            }}
          >
            {t("ลองอีกครั้ง")}
          </button>
        </div>
      ) : catalog.isPending || (player && map && routes.isPending) ? (
        <div className="card" role="status">
          {t("กำลังโหลดตำแหน่งช่วงเปิดรอบ…")}
        </div>
      ) : !players.length ? (
        <div className="card">
          <h2>{t("ยังไม่มีข้อมูล Opening Route")}</h2>
          <p>{t("นำเข้าแมตช์ที่มีตำแหน่งผู้เล่นก่อน")}</p>
          <Link to="/matches">{t("แมตช์")}</Link>
        </div>
      ) : routes.data ? (
        <OpeningRouteStage
          key={selection}
          data={routes.data}
          playerName={player?.name ?? "—"}
          map={map ?? "—"}
          side={side}
        />
      ) : null}
    </section>
  );
}

export function OpeningRouteStage({
  data,
  playerName,
  map,
  side,
}: {
  data: OpeningRoutes;
  playerName: string;
  map: string;
  side: Side;
}) {
  const { t } = useT();
  const viewportRef = useViewportFit();
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [opacity, setOpacity] = useState(0.65);
  const clock = useRef(0);
  const duration = data.window_seconds || 30;
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(data.rounds.slice(8).map((r) => r.key)),
  );
  const visible = data.rounds.filter((r) => !hidden.has(r.key));
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    let elapsed = clock.current;
    function step(now: number) {
      if (last != null)
        elapsed = Math.min(duration, elapsed + ((now - last) / 1000) * speed);
      last = now;
      clock.current = elapsed;
      setTime(elapsed);
      if (elapsed >= duration) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, duration]);
  function seek(value: number) {
    setPlaying(false);
    clock.current = Math.max(0, Math.min(duration, value));
    setTime(clock.current);
  }
  function togglePlayback() {
    if (clock.current >= duration) {
      clock.current = 0;
      setTime(0);
    }
    setPlaying((current) => !current);
  }
  const size = data.radar?.size ?? 1024;
  return (
    <>
      <div className="opening-summary">
        <strong>{playerName}</strong>
        <span>
          {map} · {side.toUpperCase()}
        </span>
        <span>{t("{n} แมตช์", { n: data.matches })}</span>
        <span>
          {t("แสดง {visible} / {total} รอบ", {
            visible: visible.length,
            total: data.rounds.length,
          })}
        </span>
      </div>
      {!data.rounds.length ? (
        <div className="card">
          <h2>{t("ไม่มีรอบที่ตรงกับตัวกรอง")}</h2>
          <p>{t("ลองเลือกทั้งหมด เปลี่ยนฝั่ง ผู้เล่น หรือแผนที่")}</p>
        </div>
      ) : (
        <div className="opening-layout" ref={viewportRef}>
          <div className="opening-main card" tabIndex={0} role="region" aria-label={t("ตัวเล่นช่วงเปิดรอบ")}
            onKeyDown={(event) => {
              if ((event.target as HTMLElement).closest("input, select, button, a, textarea")) return;
              if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault(); seek(clock.current + (event.key === "ArrowRight" ? 1 : -1));
              }
            }}>
            <header className="opening-viewer-head">
              <h2>{t("ดูช่วงเปิดรอบ")}</h2>
              <span className="opening-death-key">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
                {t("จุดที่ตาย")}
              </span>
              <output className="opening-clock" aria-label={t("เวลาปัจจุบัน")}>
                {time.toFixed(1)} / {duration}s
              </output>
            </header>
            <div className="opening-map-stage">
            {data.radar ? (
              <svg
                className="opening-radar"
                viewBox={`0 0 ${size} ${size}`}
                role="img"
                aria-label={t("Radar เส้นทางเปิดรอบ {map}", { map })}
              >
                <image href={data.radar.image} width={size} height={size} />
                {data.rounds.map((round, index) =>
                  hidden.has(round.key) ? null : (
                    <RoundOverlay
                      key={round.key}
                      round={round}
                      index={index}
                      time={time}
                      opacity={opacity}
                      size={size}
                    />
                  ),
                )}
              </svg>
            ) : (
              <div className="opening-map-missing" role="status">
                {t("แผนที่นี้ยังไม่มี radar ที่ปรับเทียบแล้ว")}
              </div>
            )}
            </div>
            <div className="opening-playback">
              <button
                type="button"
                className="opening-play-button"
                aria-label={playing ? t("หยุดชั่วคราว") : t("เล่น")}
                onClick={togglePlayback}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  {playing ? (
                    <path d="M3 2h3v12H3zm7 0h3v12h-3z" />
                  ) : (
                    <path d="M4 2l10 6-10 6z" />
                  )}
                </svg>
              </button>
              <div className="opening-speeds" role="group" aria-label={t("ความเร็ว Playback")}>
                {SPEEDS.map((value) => <button type="button" key={value} className="opening-speed"
                  aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => seek(0)}
              >
                {t("กลับ 0 วินาที")}
              </button>
              <label className="opening-timeline">
                <span className="sr-only">{t("เวลา Playback")}</span>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={time}
                  onChange={(e) => {
                    seek(Number(e.target.value));
                  }}
                />
              </label>
              <label className="opening-opacity">
                {t("ความทึบ")}
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                />
                <output>{Math.round(opacity * 100)}%</output>
              </label>
              <span className="opening-shortcuts">Space · ← →</span>
            </div>
          </div>
          <aside className="opening-rounds card" aria-label={t("รายการรอบ")}>
            <h2>
              {t("รายการรอบ")}{" "}
              <span className="muted">({data.rounds.length})</span>
            </h2>
            <div className="opening-round-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setHidden(new Set())}
              >
                {t("แสดงทุกรอบ")}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setHidden(new Set(data.rounds.map((r) => r.key)))
                }
              >
                {t("ซ่อนทุกรอบ")}
              </button>
            </div>
            <div className="opening-round-scroll">
              {data.rounds.map((round, index) => (
                <div
                  key={round.key}
                  className={`opening-round opening-series-${index % 8} ${hidden.has(round.key) ? "is-hidden" : ""}`}
                >
                  <button
                    type="button"
                    className="opening-round-toggle"
                    aria-pressed={!hidden.has(round.key)}
                    title={`${round.match_name} · ${round.demo_file}`}
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(round.key)) next.delete(round.key);
                        else next.add(round.key);
                        return next;
                      })
                    }
                  >
                    <span className="opening-round-number">{index + 1}</span>
                    <span className="opening-round-copy">
                      <strong>
                        R{round.round_num} · {round.match_name}
                      </strong>
                      <small>
                        {round.match_date ?? "—"} ·{" "}
                        {hidden.has(round.key) ? t("ซ่อน") : t("แสดง")}
                      </small>
                      {!round.clock_available ? (
                        <small>{t("ไม่มีเวลาเริ่มรอบ")}</small>
                      ) : (
                        !round.segments.length && (
                          <small>{t("ไม่มีตำแหน่งผู้เล่นในช่วงนี้")}</small>
                        )
                      )}
                    </span>
                  </button>
                  <Link
                    className="opening-evidence"
                    to={`/matches/${encodeURIComponent(round.demo_file)}/rounds/${round.round_num}`}
                    aria-label={t("เปิดหลักฐานรอบ {n}", { n: round.round_num })}
                  >
                    {t("ดูรอบ")}
                  </Link>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function RoundOverlay({
  round,
  index,
  time,
  opacity,
  size,
}: {
  round: OpeningRound;
  index: number;
  time: number;
  opacity: number;
  size: number;
}) {
  const { t } = useT();
  const state = openingAt(round, time);
  const scale = size / 1024;
  return (
    <g className={`opening-series-${index % 8}`} opacity={opacity}>
      {state.marker && (
        <g data-testid="opening-live-marker">
          <circle
            cx={state.marker[0]}
            cy={state.marker[1]}
            r={13 * scale}
            className="opening-marker"
          />
          <text
            x={state.marker[0]}
            y={state.marker[1]}
            dy=".35em"
            textAnchor="middle"
            className="opening-marker-label"
            fontSize={14 * scale}
          >
            {index + 1}
          </text>
          <title>
            {round.match_name} · R{round.round_num} · {time.toFixed(1)}s
          </title>
        </g>
      )}
      {state.deathMarker && (
        <g className="opening-death-marker" data-testid="opening-death-marker"
          transform={`translate(${state.deathMarker[0]} ${state.deathMarker[1]})`}
          role="img" aria-label={`${t("จุดที่ตาย")} · R${round.round_num} · ${round.death_t?.toFixed(1)}s`}>
          <title>{round.match_name} · R{round.round_num} · {round.death_t?.toFixed(1)}s
            {round.death_px ? "" : ` · ${t("ตำแหน่งสุดท้ายก่อนตาย")}`}</title>
          <path d={`M${-9 * scale} ${-9 * scale}L${9 * scale} ${9 * scale}M${9 * scale} ${-9 * scale}L${-9 * scale} ${9 * scale}`}
            className="opening-death-outline" strokeWidth={7 * scale} />
          <path d={`M${-9 * scale} ${-9 * scale}L${9 * scale} ${9 * scale}M${9 * scale} ${-9 * scale}L${-9 * scale} ${9 * scale}`}
            strokeWidth={4 * scale} />
          <text x={14 * scale} y={5 * scale} fontSize={13 * scale}>{index + 1}</text>
        </g>
      )}
    </g>
  );
}
