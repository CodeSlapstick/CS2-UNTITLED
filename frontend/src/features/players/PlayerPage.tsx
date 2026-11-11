import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ApiError,
  auth,
  isGuest,
  playerApi,
  type PlayerMap,
  type PlayerProfileFilters,
  type PlayerWeapon,
} from "@/shared/api";
import { MapThumb, weaponLabel } from "@/shared/ui/utils";
import "./player-profile.css";
import unknownAvatar from "@/features/players/assets/avatar-unknown.jpg";
import { useT } from "@/shared/i18n";

function isoDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
}

export function PlayerPage() {
  const { steamId } = useParams();
  const who = steamId ?? "me";
  const { t } = useT();
  const valueOrData = (
    value: number | null | undefined,
    digits = 1,
    suffix = "",
  ) => (value == null ? t("ไม่มีข้อมูล") : `${value.toFixed(digits)}${suffix}`);
  const filters: PlayerProfileFilters = { recent: 0, side: "all" };
  const profile = useQuery({
    queryKey: [
      "player-profile",
      who,
      filters.recent,
      filters.date_from,
      filters.date_to,
      filters.map,
      filters.side,
    ],
    queryFn: () => playerApi.profile(who, filters),
    retry: false,
  });

  if (profile.isLoading)
    return (
      <p className="muted" role="status">
        {t("กำลังโหลดสถิติ…")}
      </p>
    );
  if (profile.error instanceof ApiError)
    return (
      <PlayerEmpty
        status={profile.error.status}
        message={profile.error.message}
        mine={!steamId}
      />
    );
  if (profile.error)
    return (
      <p className="err" role="alert">
        {t("โหลดสถิติไม่ได้: {msg}", {
          msg: t((profile.error as Error).message),
        })}
      </p>
    );
  if (!profile.data) return null;

  const d = profile.data;
  const tot = d.totals;
  const entryRate = (entry: { kills: number; deaths: number }) =>
    entry.kills + entry.deaths
      ? entry.kills / (entry.kills + entry.deaths)
      : null;
  return (
    <div className="player" data-testid="player-page">
      <header className="pl-head">
        <span className="pl-game-tag">
          {t("COUNTER-STRIKE 2")} <span>{t("โปรไฟล์ผู้เล่น")}</span>
        </span>
        <img
          className="pl-avatar"
          src={d.player.avatar || unknownAvatar}
          alt=""
          referrerPolicy="no-referrer"
        />
        <div className="pl-identity">
          <h1>{d.player.name}</h1>
          <p className="muted">
            {d.player.account_name || `Steam ${d.player.steam_id}`}{" "}
            {d.player.latest_team ? `· ${d.player.latest_team}` : ""}
          </p>
          <p className="muted small">
            {t("ข้อมูล {matches} แมตช์ · {rounds} รอบ", {
              matches: d.source.selected_matches,
              rounds: d.source.selected_rounds,
            })}{" "}
            · {isoDate(d.data_range.from)} – {isoDate(d.data_range.to)}
          </p>
        </div>
        <div className="pl-source">
          <strong>{d.source.selected_matches}</strong>
          <span>{t("แมตช์ที่ใช้คำนวณ")}</span>
        </div>
        <div className="pl-sidebar-facts">
          <div>
            <span>{t("Steam ID")}</span>
            <b>{d.player.steam_id}</b>
          </div>
          <div>
            <span>{t("ทีม")}</span>
            <b>{d.player.latest_team || "—"}</b>
          </div>
          <div>
            <span>{t("รอบ")}</span>
            <b>{d.source.selected_rounds.toLocaleString()}</b>
          </div>
        </div>
      </header>
      <div className="pl-content">
        {!tot ? (
          <section className="card pl-filter-empty">
            <h2>{t("ไม่มีข้อมูลตามตัวกรองนี้")}</h2>
            <p className="muted">
              {t("ลองขยายช่วงแมตช์ วันที่ แผนที่ หรือเลือกทั้งสองฝั่ง")}
            </p>
          </section>
        ) : (
          <>
            <section
              id="pl-overview"
              className="pl-grid"
              aria-label={t("สถิติหลัก")}
            >
              <article className="card pl-card pl-kd">
                <h2>K/D</h2>
                <Gauge
                  value={tot.kd ?? 0}
                  max={2}
                  label={valueOrData(tot.kd, 2)}
                />
                <p className="muted small">
                  {t("{k} คิล · {d} ตาย · {a} ช่วย", {
                    k: tot.kills,
                    d: tot.deaths,
                    a: tot.assists,
                  })}
                </p>
              </article>
              <article className="card pl-card pl-rating">
                <h2>{t("Rating 1.0 ที่คำนวณ")}</h2>
                <Gauge
                  value={tot.rating ?? 0}
                  max={2}
                  label={valueOrData(tot.rating, 2)}
                />
                <p className="muted small">
                  {t(
                    "ใช้สูตร Rating 1.0 ที่เผยแพร่ ไม่ใช่ค่าจาก stat feed อย่างเป็นทางการ",
                  )}
                  <br />
                  {t("Rating 2.0 ค่าประมาณ: {v}", {
                    v: tot.rating2_approx.toFixed(2),
                  })}
                  <br />
                  {t("ไม่ใช่ค่า HLTV Rating 2.0 อย่างเป็นทางการ")}
                </p>
              </article>
              <article className="card pl-card pl-win">
                <h2>{t("ชนะรอบ")}</h2>
                <Gauge
                  value={tot.win_rate}
                  max={100}
                  label={valueOrData(tot.win_rate, 0, "%")}
                  unit
                />
                <p className="muted small">
                  {t("{r} รอบใน {m} แมตช์", { r: tot.rounds, m: tot.matches })}
                </p>
              </article>
              <article className="card pl-card pl-headshots">
                <h2>{t("เฮดช็อต")}</h2>
                <strong className="pl-big-number">
                  {valueOrData(tot.hs_rate, 0)}
                  <small>%</small>
                </strong>
                <dl className="pl-facts">
                  <div>
                    <dt>{t("คิล")}</dt>
                    <dd>{tot.kills.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>{t("ตาย")}</dt>
                    <dd>{tot.deaths.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>{t("ช่วย")}</dt>
                    <dd>{tot.assists.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>{t("เฮดช็อต")}</dt>
                    <dd>{tot.headshots.toLocaleString()}</dd>
                  </div>
                </dl>
              </article>
              <article className="card pl-card pl-damage">
                <h2>{t("ดาเมจเฉลี่ยต่อรอบ")}</h2>
                <strong className="pl-big-number">
                  {valueOrData(tot.adr, 1)}
                </strong>
                <dl className="pl-facts">
                  <div>
                    <dt>KAST</dt>
                    <dd>{valueOrData(tot.kast, 0, "%")}</dd>
                  </div>
                  <div>
                    <dt>{t("รอดจบรอบ")}</dt>
                    <dd>{valueOrData(tot.survival_rate, 0, "%")}</dd>
                  </div>
                  <div>
                    <dt>{t("รอบ")}</dt>
                    <dd>{tot.rounds.toLocaleString()}</dd>
                  </div>
                </dl>
              </article>
              <article className="card pl-card pl-radar-card">
                <div className="pl-radar-copy">
                  <h2>{t("ภาพรวมการเล่น")}</h2>
                  <p className="muted small">
                    {t("เปอร์เซ็นต์จริงจากแมตช์ที่เลือก ไม่ใช่คะแนนประเมิน")}
                  </p>
                </div>
                <PersonalRadar
                  values={[
                    { label: t("ชนะรอบ"), value: tot.win_rate },
                    { label: "KAST", value: tot.kast },
                    { label: t("รอดจบรอบ"), value: tot.survival_rate },
                    { label: t("เฮดช็อต"), value: tot.hs_rate },
                    {
                      label: "Entry",
                      value:
                        entryRate(d.entry.both) == null
                          ? null
                          : entryRate(d.entry.both)! * 100,
                    },
                  ]}
                />
              </article>
              <article className="card pl-card pl-wide pl-clutch-card">
                <h2>{t("Clutch 1v1–1v5")}</h2>
                {d.clutches ? (
                  <>
                    <div className="pl-clutch-summary">
                      <span>1vX</span>
                      <strong>
                        {d.clutches.reduce((n, c) => n + c.attempts, 0)
                          ? `${Math.round((d.clutches.reduce((n, c) => n + c.wins, 0) / d.clutches.reduce((n, c) => n + c.attempts, 0)) * 100)}%`
                          : "—"}
                      </strong>
                      <small>{t("ชนะ")}</small>
                    </div>
                    <div className="pl-clutches">
                      {d.clutches.map((clutch) => (
                        <MiniPie
                          key={clutch.vs}
                          label={`1v${clutch.vs}`}
                          wins={clutch.wins}
                          attempts={clutch.attempts}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">{t("ไม่มีข้อมูล")}</p>
                )}
              </article>
              <article className="card pl-card pl-wide pl-entry-card">
                <h2>{t("Entry — First kill / First death")}</h2>
                <div className="pl-donuts">
                  <Donut
                    label={t("รวม")}
                    value={entryRate(d.entry.both)}
                    won={d.entry.both.kills}
                    lost={d.entry.both.deaths}
                  />
                  <Donut
                    label={t("ฝั่ง CT")}
                    value={entryRate(d.entry.ct)}
                    won={d.entry.ct.kills}
                    lost={d.entry.ct.deaths}
                    tone="ct"
                  />
                  <Donut
                    label={t("ฝั่ง T")}
                    value={entryRate(d.entry.t)}
                    won={d.entry.t.kills}
                    lost={d.entry.t.deaths}
                    tone="t"
                  />
                </div>
                <p className="muted small">
                  {t(
                    "เปอร์เซ็นต์ = First kills / (First kills + First deaths)",
                  )}
                </p>
              </article>
            </section>

            <section id="pl-details" className="pl-panels">
              <article className="card pl-panel-wide">
                <h2>{t("แมตช์ล่าสุด")}</h2>
                <ul className="pl-matches">
                  {d.recent_matches.map((match) => (
                    <li key={match.match_id} className={`r-${match.result}`}>
                      <Link
                        to={`/matches/${encodeURIComponent(match.demo_file)}/rounds/1?p=${encodeURIComponent(d.player.steam_id)}`}
                      >
                        <MapThumb map={match.map_name} className="pl-thumb" />
                        <span className="pl-res">
                          {match.result === "win"
                            ? t("ชนะ")
                            : match.result === "loss"
                              ? t("แพ้")
                              : t("เสมอ")}
                        </span>
                        <span className="pl-mt">
                          {match.team_a && match.team_b
                            ? `${match.team_a} vs ${match.team_b}`
                            : match.demo_file}
                          <small>
                            {match.map_name} · {isoDate(match.imported_at)} ·{" "}
                            {match.kills}/{match.deaths}/{match.assists}
                          </small>
                        </span>
                        <span className="pl-rt">
                          {valueOrData(match.rating, 2)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
              <article id="pl-loadout" className="card pl-map-card">
                <h2>{t("แมพที่เล่นบ่อย")}</h2>
                <Bars
                  rows={d.maps.map(
                    (map: PlayerMap & { kd: number | null }) => ({
                      key: map.map_name,
                      label: map.map_name,
                      value: map.matches,
                      note: t("Win {win}% · Rating {rating} · K/D {kd}", {
                        win: map.win_rate.toFixed(0),
                        rating: valueOrData(map.rating, 2),
                        kd: valueOrData(map.kd, 2),
                      }),
                      ratio: map.win_rate / 100,
                    }),
                  )}
                  empty={t("ยังไม่มีข้อมูลแมพ")}
                />
              </article>
              <article className="card">
                <h2>{t("อาวุธที่ฆ่าบ่อย")}</h2>
                <Bars
                  rows={d.weapons.map((weapon: PlayerWeapon) => ({
                    key: weapon.weapon,
                    label: weaponLabel(weapon.weapon),
                    value: weapon.kills,
                    note: `${t("เฮดช็อต {pct}%", { pct: weapon.hs_rate.toFixed(0) })} · ${t("ความแม่นยำ: ไม่มีข้อมูล")}`,
                    ratio: weapon.hs_rate / 100,
                  }))}
                  empty={t("ยังไม่มีข้อมูลอาวุธ")}
                />
              </article>
              <BehaviorCard behavior={d.behavior} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function BehaviorCard({
  behavior,
}: {
  behavior: Awaited<ReturnType<typeof playerApi.profile>>["behavior"];
}) {
  const { t } = useT();
  return (
    <article className="card pl-panel-wide">
      <h2>{t("รูปแบบการเล่นตามฝั่ง")}</h2>
      <div className="pl-behavior">
        {behavior.sides.map((side) => (
          <section key={side.side} className={`side-${side.side}`}>
            <h3>{side.side.toUpperCase()}</h3>
            {side.available ? (
              <>
                <strong>{side.role}</strong>
                <p className="muted small">
                  {t("อ้างอิงจาก {rounds} รอบใน {profiles} แมตช์", {
                    profiles: side.profiles ?? 0,
                    rounds: side.rounds ?? 0,
                  })}
                </p>
              </>
            ) : (
              <p className="muted">{t("ข้อมูลไม่เพียงพอ")}</p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

type RadarValue = { label: string; value: number | null | undefined };

function PersonalRadar({ values }: { values: RadarValue[] }) {
  const size = 320;
  const center = size / 2;
  const radius = 108;
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / values.length);
    return [
      center + Math.cos(angle) * radius * ratio,
      center + Math.sin(angle) * radius * ratio,
    ] as const;
  };
  const polygon = (ratio: number) =>
    values.map((_, index) => point(index, ratio).join(",")).join(" ");
  const safeValues = values.map((item) => ({
    ...item,
    value:
      typeof item.value === "number" && Number.isFinite(item.value)
        ? Math.max(0, Math.min(100, item.value))
        : null,
  }));
  const dataPoints = safeValues.map((item, index) =>
    point(index, (item.value ?? 0) / 100),
  );
  return (
    <div className="pl-radar-wrap">
      <svg
        className="pl-radar"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby="personal-radar-title personal-radar-desc"
      >
        <title id="personal-radar-title">ภาพรวมสถิติผู้เล่น</title>
        <desc id="personal-radar-desc">
          {safeValues
            .map(
              (item) =>
                `${item.label} ${item.value == null ? "ไม่มีข้อมูล" : `${Math.round(item.value)}%`}`,
            )
            .join(", ")}
        </desc>
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon
            key={ratio}
            points={polygon(ratio)}
            className="pl-radar-grid"
          />
        ))}
        {values.map((_, index) => {
          const [x, y] = point(index, 1);
          return (
            <line
              key={index}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              className="pl-radar-axis"
            />
          );
        })}
        <polygon
          points={dataPoints.map((p) => p.join(",")).join(" ")}
          className="pl-radar-shape"
        />
        {dataPoints.map(([x, y], index) => (
          <circle
            key={safeValues[index].label}
            cx={x}
            cy={y}
            r="4"
            className="pl-radar-point"
          />
        ))}
      </svg>
      <dl className="pl-radar-values">
        {safeValues.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value == null ? "—" : `${Math.round(item.value)}%`}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PlayerEmpty({
  status,
  message,
  mine,
}: {
  status: number;
  message: string;
  mine: boolean;
}) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: auth.me,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const guest = isGuest(me.data?.user);
  const needsSteam = status === 409;
  const { pathname } = useLocation();
  const { t } = useT();
  return (
    <div className="pl-empty card">
      <h1>
        {needsSteam ? t("ยังไม่มีสถิติของตัวเอง") : t("ยังไม่มีสถิติของคุณ")}
      </h1>
      <p className="muted">{t(message)}</p>
      {needsSteam && guest ? (
        <>
          <p className="muted">
            {t(
              "My Stats ต้องใช้ Steam ID ที่ยืนยันจากบัญชี ไม่เดาจาก nickname",
            )}
          </p>
          <a
            className="btn-primary"
            href={`/auth/steam/login?next=${encodeURIComponent(pathname)}`}
          >
            {t("ล็อกอินด้วย Steam เพื่อดูสถิติของตัวเอง")}
          </a>
        </>
      ) : needsSteam ? (
        <Link className="btn-primary" to="/players?link=1">
          {t("ค้นหาและยืนยันผู้เล่นของคุณ")}
        </Link>
      ) : (
        <>
          {mine && (
            <p className="muted">
              {t(
                "บัญชีเชื่อมกับ Steam แล้ว แต่ยังไม่มี demo ของ Steam ID นี้ในระบบ",
              )}
            </p>
          )}
          <Link className="btn-primary" to="/matches">
            {t("ไปหน้าแมตช์")}
          </Link>
        </>
      )}
    </div>
  );
}

const ARC = 2 * Math.PI * 52;
function Gauge({
  value,
  max,
  label,
  unit = false,
}: {
  value: number;
  max: number;
  label: string;
  unit?: boolean;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const { t } = useT();
  return (
    <svg
      className="pl-gauge"
      viewBox="0 0 120 120"
      role="img"
      aria-label={unit ? label : t("{v} จาก {max}", { v: label, max })}
    >
      <circle cx="60" cy="60" r="52" className="pl-track" />
      <circle
        cx="60"
        cy="60"
        r="52"
        className="pl-arc"
        strokeDasharray={`${ratio * ARC} ${ARC}`}
        transform="rotate(-90 60 60)"
      />
      <text
        x="60"
        y="60"
        className="pl-gauge-v"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </svg>
  );
}

function Donut({
  label,
  value,
  won,
  lost,
  tone = "",
}: {
  label: string;
  value: number | null;
  won: number;
  lost: number;
  tone?: string;
}) {
  const ratio = value ?? 0;
  const { t } = useT();
  return (
    <div className={`pl-donut ${tone}`}>
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={t("{label} {won} ชนะ {lost} แพ้", { label, won, lost })}
      >
        <circle cx="60" cy="60" r="52" className="pl-track" />
        <circle
          cx="60"
          cy="60"
          r="52"
          className="pl-arc"
          strokeDasharray={`${ratio * ARC} ${ARC}`}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="54"
          className="pl-gauge-v"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {value == null ? "—" : `${Math.round(ratio * 100)}%`}
        </text>
        <text
          x="60"
          y="78"
          className="pl-gauge-s"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {won} FK · {lost} FD
        </text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

function MiniPie({
  label,
  wins,
  attempts,
}: {
  label: string;
  wins: number;
  attempts: number;
}) {
  const ratio = attempts ? wins / attempts : 0;
  const { t } = useT();
  return (
    <div className={`pl-pie${attempts ? "" : " none"}`}>
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={t("{label} ชนะ {wins} จาก {attempts}", {
          label,
          wins,
          attempts,
        })}
      >
        <circle cx="60" cy="60" r="52" className="pl-track" />
        <circle
          cx="60"
          cy="60"
          r="52"
          className="pl-arc"
          strokeDasharray={`${ratio * ARC} ${ARC}`}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="60"
          className="pl-gauge-v"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {attempts ? wins : "—"}
        </text>
      </svg>
      <span>{label}</span>
      <span className="muted small">
        {attempts ? `${wins}/${attempts}` : t("ไม่มี")}
      </span>
    </div>
  );
}

interface BarRow {
  key: string;
  label: string;
  value: number;
  note: string;
  ratio: number;
}
function Bars({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  const top = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="pl-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="pl-bl">{row.label}</span>
          <span className="pl-bv">{row.value}</span>
          <span className="pl-bar">
            <i style={{ width: `${(row.value / top) * 100}%` }} />
          </span>
          <span className="muted small">{row.note}</span>
        </li>
      ))}
    </ul>
  );
}
