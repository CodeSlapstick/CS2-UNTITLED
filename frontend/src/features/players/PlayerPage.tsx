import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, auth, isGuest, playerApi, type PlayerProfileFilters } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { PlayerProfileContent } from "./PlayerProfileContent";
import "./player-profile.css";

export function PlayerPage() {
  const { steamId } = useParams();
  const who = steamId ?? "me";
  const { t } = useT();
  const [recent, setRecent] = useState<PlayerProfileFilters["recent"]>(0);
  const filters: PlayerProfileFilters = { recent, side: "all" };
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

  return <PlayerProfileContent data={profile.data} recent={recent} onRecentChange={setRecent} />;
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
