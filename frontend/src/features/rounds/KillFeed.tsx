import type { ReviewDeath } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { fmtT, weaponLabel } from "@/shared/ui/utils";
import { WeaponIcon } from "@/shared/ui/gameIcons";
import "./kill-feed.css";

export function KillFeed({ deaths, time, onSeek }: {
  deaths: ReviewDeath[];
  time: number;
  onSeek: (death: ReviewDeath) => void;
}) {
  const { t } = useT();
  const recent = deaths.filter(death => death.t_round != null && death.t_round >= 0 && death.t_round <= time)
    .sort((a, b) => a.t_round! - b.t_round! || a.tick - b.tick || a.order - b.order).slice(-5).reverse();
  if (!recent.length) return null;
  return <ol className="replay-kill-feed" aria-label={t("เหตุการณ์ฆ่าล่าสุด")} data-testid="kill-feed">
    {recent.map(death => <li key={death.order}>
      <button type="button" onClick={() => onSeek(death)} title={t("ดูเหตุการณ์เวลา {time}", { time: fmtT(death.t_round) })}>
        <time>{fmtT(death.t_round)}</time>
        <span className={`feed-player feed-${death.attacker?.side ?? "world"}`} title={death.attacker?.name ?? t("สิ่งแวดล้อม")}>
          {death.attacker?.name ?? t("สิ่งแวดล้อม")}</span>
        {death.assister && <span className="feed-assist" title={t("ช่วยโดย {name}", { name: death.assister })}>+ {death.assister}</span>}
        <span className="feed-weapon" title={weaponLabel(death.weapon)}><WeaponIcon name={death.weapon} /></span>
        <span className="sr-only">{weaponLabel(death.weapon)}</span>
        {death.headshot && <span className="feed-headshot" title={t("เฮดช็อต")} aria-label={t("เฮดช็อต")}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5" /><path d="M10 1v5m0 8v5M1 10h5m8 0h5" /></svg>
        </span>}
        <span className={`feed-player feed-${death.victim.side}`} title={death.victim.name}>{death.victim.name}</span>
      </button>
    </li>)}
  </ol>;
}
