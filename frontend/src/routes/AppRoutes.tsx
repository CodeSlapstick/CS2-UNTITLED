import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AnalysisPage } from "@/features/analysis/AnalysisPage";
import { HeatmapPage } from "@/features/analysis/HeatmapPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { CoachPage } from "@/features/coach/CoachPage";
import { HomePage } from "@/features/home/HomePage";
import { EconomyPage } from "@/features/matches/EconomyPage";
import { MatchesPage } from "@/features/matches/MatchesPage";
import { MatchPage } from "@/features/matches/MatchPage";
import { PlayerPage } from "@/features/players/PlayerPage";
import { RoundPage } from "@/features/rounds/RoundPage";
import { PlayerSearchPage } from "@/features/search/PlayerSearch";
import { ApiError, auth, UNAUTHORIZED_EVENT } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { NotFound } from "@/shared/ui/utils";

export function ProtectedRoute() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useT();
  const me = useQuery({ queryKey: ["me"], queryFn: auth.me, retry: false, staleTime: 5 * 60_000 });

  useEffect(() => {
    const onUnauthorized = () => queryClient.invalidateQueries({ queryKey: ["me"] });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  if (me.isLoading) return <p className="muted">{t("กำลังตรวจสอบการเข้าใช้งาน…")}</p>;
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return <p className="err">{t("ติดต่อเซิร์ฟเวอร์ไม่ได้: {msg}", { msg: t((me.error as Error).message) })}</p>;
  }
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/matches/:demo" element={<MatchPage />} />
        <Route path="/matches/:demo/rounds/:n" element={<RoundPage />} />
        <Route path="/matches/:demo/heatmap" element={<HeatmapPage />} />
        <Route path="/matches/:demo/economy" element={<EconomyPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/opening-route" element={<Navigate to="/analysis?tool=opening-route" replace />} />
        <Route path="/coach" element={<CoachPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/player/:steamId" element={<PlayerPage />} />
        <Route path="/players" element={<PlayerSearchPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
