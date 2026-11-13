import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import type { PlayerProfile, PlayerProfileFilters } from "@/shared/api";
import { MapThumb, weaponLabel } from "@/shared/ui/utils";
import { useT } from "@/shared/i18n";
import unknownAvatar from "./assets/avatar-unknown.jpg";
import { PlayerFormChart } from "./PlayerFormChart";

const TABS = ["overview", "duels", "loadout"] as const;
type Tab = typeof TABS[number];

function number(value: number | null | undefined, digits = 0, suffix = "") {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits) + suffix;
}

function mapLabel(map: string | null) {
  if (!map) return "—";
  return map.replace(/^de_/, "").replace(/^./, letter => letter.toUpperCase());
}

export function PlayerProfileContent({ data: d, recent, onRecentChange }: {
  data: PlayerProfile;
  recent: PlayerProfileFilters["recent"];
  onRecentChange: (recent: PlayerProfileFilters["recent"]) => void;
}) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const tot = d.totals;
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const tabLabels = { overview: t("ภาพรวม"), duels: t("การปะทะ"), loadout: t("แผนที่และอาวุธ") };
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.indexOf(tab);
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
      : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next == null) return;
    event.preventDefault();
    setTab(TABS[next]);
    document.getElementById(`profile-tab-${TABS[next]}`)?.focus();
  }

  return <div className="player-profile" data-testid="player-page">
    <header className="profile-identity">
      <img className="profile-avatar" src={d.player.avatar || unknownAvatar} alt="" referrerPolicy="no-referrer"
        style={{ backgroundImage: `url(${unknownAvatar})` }}
        onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = unknownAvatar; }} />
      <div className="profile-name">
        <h1>{d.player.name}</h1>
      </div>
      <a className="profile-steam" href={`https://steamcommunity.com/profiles/${d.player.steam_id}`} target="_blank" rel="noreferrer" aria-label={t("เปิดโปรไฟล์ Steam")} title={t("เปิดโปรไฟล์ Steam")}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="15.1" cy="9.1" r="2.9" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="15.1" cy="9.1" r="1" fill="currentColor" />
          <circle cx="8.4" cy="15.2" r="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M10.6 14.1 13 11.2M2.9 12.6l3.2 1.3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </a>
    </header>

    <div className="profile-scope">
      <div><b>{t("{n} แมตช์", { n: d.source.selected_matches })}</b><span>{t("{n} รอบ", { n: d.source.selected_rounds })}</span></div>
      <label>{t("ช่วงข้อมูล")}
        <select value={recent} onChange={event => onRecentChange(Number(event.target.value) as PlayerProfileFilters["recent"])}>
          <option value={0}>{t("ทุกแมตช์")}</option>
          {[5, 10, 20].map(value => <option key={value} value={value}>{t("{n} แมตช์ล่าสุด", { n: value })}</option>)}
        </select>
      </label>
    </div>

    {!tot ? <section className="profile-empty"><h2>{t("ยังไม่มีสถิติในช่วงนี้")}</h2><p>{t("เลือกทุกแมตช์เพื่อดูข้อมูลที่มี")}</p></section> : <>
      <dl className="profile-metrics" aria-label={t("สถิติหลัก")}>
        {[
          { label: "Rating 1.0", value: number(tot.rating, 2), detail: t("คำนวณจากเดโม") },
          { label: "K/D", value: number(tot.kd, 2), detail: t("อัตราคิลต่อการตาย") },
          { label: "ADR", value: number(tot.adr, 1), detail: t("ดาเมจต่อรอบ") },
          { label: "KAST", value: number(tot.kast, 1, "%"), detail: t("คิล ช่วย รอด หรือเทรด") },
          { label: t("เฮดช็อต"), value: number(tot.hs_rate, 1, "%"), detail: t("สัดส่วนจากคิลทั้งหมด") },
          { label: t("ชนะรอบ"), value: number(tot.win_rate, 1, "%"), detail: t("สัดส่วนจากรอบที่เล่น") },
        ].map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd><span>{metric.detail}</span></div>)}
      </dl>

      <PlayerFormChart key={recent} matches={d.recent_matches} />

      <div className="profile-tabs" role="tablist" aria-label={t("หมวดสถิติ")}>
        {TABS.map(key => <button key={key} id={`profile-tab-${key}`} role="tab" type="button"
          aria-selected={tab === key} aria-controls={`profile-panel-${key}`} tabIndex={tab === key ? 0 : -1}
          onClick={() => setTab(key)} onKeyDown={navigateTabs}>{tabLabels[key]}</button>)}
      </div>

      <section id={`profile-panel-${tab}`} role="tabpanel" aria-labelledby={`profile-tab-${tab}`} tabIndex={0}>
        {tab === "overview" && <div className="profile-overview">
          <section className="profile-history">
            <div className="profile-section-heading"><h2>{t("แมตช์ล่าสุด")}</h2></div>
            {d.recent_matches.length ? <table className="profile-match-table">
              <thead><tr><th>{t("แมตช์")}</th><th>K / D / A</th><th className="profile-adr">ADR</th><th>Rating</th></tr></thead>
              <tbody>{d.recent_matches.map(match => <tr key={match.match_id}>
                <td><Link className="profile-match-identity" to={`/matches/${encodeURIComponent(match.demo_file)}/rounds/1?p=${encodeURIComponent(d.player.steam_id)}`}>
                  <MapThumb map={match.map_name} className="profile-map-thumb" />
                  <div><strong className="profile-match-title">
                    {match.team_a && match.team_b ? `${match.team_a} vs ${match.team_b}` : mapLabel(match.map_name)}</strong>
                    <span className="profile-match-meta"><b className={`profile-result result-${match.result}`}>
                      {match.result === "win" ? t("ชนะ") : match.result === "loss" ? t("แพ้") : t("เสมอ")}</b>
                      {match.team_a && match.team_b && <span>{mapLabel(match.map_name)}</span>}
                      <time className="profile-match-date" dateTime={match.imported_at}>{date(match.imported_at)}</time></span>
                  </div></Link></td>
                <td className="profile-kda">{match.kills}<span> / </span>{match.deaths}<span> / </span>{match.assists}</td>
                <td className="profile-adr">{number(match.adr, 1)}</td><td className="profile-match-rating">{number(match.rating, 2)}</td>
              </tr>)}</tbody>
            </table> : <p className="profile-empty-note">{t("ยังไม่มีแมตช์ในช่วงนี้")}</p>}
          </section>

          <aside className="profile-summary">
            <section className="profile-ledger"><h2>{t("สถิติรวม")}</h2>
              <dl>{[
                [t("คิล"), tot.kills.toLocaleString()], [t("ตาย"), tot.deaths.toLocaleString()],
                [t("ช่วย"), tot.assists.toLocaleString()], [t("เฮดช็อต"), tot.headshots.toLocaleString()],
                [t("รอดจบรอบ"), number(tot.survival_rate, 1, "%")],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </section>
            <section className="profile-recent-results"><h2>{t("ผลแมตช์ล่าสุด")}</h2>
              <div>{d.recent_matches.slice(0, 10).map(match => <Link key={match.match_id}
                className={`profile-result result-${match.result}`}
                to={`/matches/${encodeURIComponent(match.demo_file)}/rounds/1?p=${encodeURIComponent(d.player.steam_id)}`}
                aria-label={`${mapLabel(match.map_name)} · ${match.result === "win" ? t("ชนะ") : match.result === "loss" ? t("แพ้") : t("เสมอ")}`}>
                {match.result === "win" ? "W" : match.result === "loss" ? "L" : "D"}</Link>)}</div>
            </section>
          </aside>
        </div>}

        {tab === "duels" && <div className="profile-duels">
          <section className="profile-section"><h2>{t("การปะทะแรกของรอบ")}</h2>
            <table className="profile-data-table"><thead><tr><th>{t("ฝั่ง")}</th><th>First kill</th><th>First death</th><th>{t("ชนะการปะทะ")}</th></tr></thead>
              <tbody>{(["both", "ct", "t"] as const).map(side => {
                const entry = d.entry[side];
                const attempts = entry.kills + entry.deaths;
                return <tr key={side}><th>{side === "both" ? t("รวม") : side.toUpperCase()}</th><td>{entry.kills}</td><td>{entry.deaths}</td>
                  <td>{attempts ? number(entry.kills / attempts * 100, 1, "%") : "—"}</td></tr>;
              })}</tbody>
            </table>
          </section>
          <section className="profile-section"><h2>Clutch</h2>
            {d.clutches ? <table className="profile-data-table"><thead><tr><th>{t("สถานการณ์")}</th><th>{t("ชนะ")}</th><th>{t("โอกาส")}</th><th>{t("อัตราชนะ")}</th></tr></thead>
              <tbody>{d.clutches.map(clutch => <tr key={clutch.vs}><th>1v{clutch.vs}</th><td>{clutch.wins}</td><td>{clutch.attempts}</td>
                <td>{clutch.attempts ? number(clutch.wins / clutch.attempts * 100, 1, "%") : "—"}</td></tr>)}</tbody>
            </table> : <p className="profile-empty-note">{t("ไม่มีข้อมูล Clutch")}</p>}
          </section>
          <section className="profile-section profile-role"><h2>{t("รูปแบบการเล่นตามฝั่ง")}</h2>
            <div>{d.behavior.sides.map(side => <section key={side.side}>
              <h3 className={`profile-side-${side.side}`}>{side.side.toUpperCase()}</h3>
              {side.available ? <><strong>{side.role}</strong><p className="profile-caption">{t("{n} รอบ", { n: side.rounds ?? 0 })} · {t("{n} แมตช์", { n: side.profiles ?? 0 })}</p></>
                : <p className="profile-empty-note">{t("ข้อมูลไม่เพียงพอ")}</p>}
            </section>)}</div>
          </section>
        </div>}

        {tab === "loadout" && <div className="profile-loadout">
          <section className="profile-section"><h2>{t("สถิติตามแผนที่")}</h2>
            {d.maps.length ? <table className="profile-data-table"><thead><tr><th>{t("แผนที่")}</th><th>{t("แมตช์")}</th><th>K/D</th><th>Rating</th><th>{t("ชนะแมตช์")}</th></tr></thead>
              <tbody>{d.maps.map(map => <tr key={map.map_name}><th><span className="profile-map-name"><MapThumb map={map.map_name} className="profile-small-thumb" />{mapLabel(map.map_name)}</span></th>
                <td>{map.matches}</td><td>{number(map.kd, 2)}</td><td>{number(map.rating, 2)}</td><td>{number(map.win_rate, 0, "%")}</td></tr>)}</tbody>
            </table> : <p className="profile-empty-note">{t("ยังไม่มีข้อมูลแมพ")}</p>}
          </section>
          <section className="profile-section"><h2>{t("สถิติอาวุธ")}</h2>
            {d.weapons.length ? <table className="profile-data-table"><thead><tr><th>{t("อาวุธ")}</th><th>{t("คิล")}</th><th>{t("เฮดช็อต")}</th></tr></thead>
              <tbody>{d.weapons.map(weapon => <tr key={weapon.weapon}><th>{weaponLabel(weapon.weapon)}</th><td>{weapon.kills}</td><td>{number(weapon.hs_rate, 0, "%")}</td></tr>)}</tbody>
            </table> : <p className="profile-empty-note">{t("ยังไม่มีข้อมูลอาวุธ")}</p>}
          </section>
        </div>}
      </section>

    </>}
  </div>;
}
