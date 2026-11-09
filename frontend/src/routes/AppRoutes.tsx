import { lazy, Suspense, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { ApiError, auth, UNAUTHORIZED_EVENT } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { NotFound } from "@/shared/ui/utils";

const AnalysisPage = lazy(() => import("@/features/analysis/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const HeatmapPage = lazy(() => import("@/features/analysis/HeatmapPage").then((module) => ({ default: module.HeatmapPage })));
const LoginPage = lazy(() => import("@/features/auth/LoginPage").then((module) => ({ default: module.LoginPage })));
const CoachPage = lazy(() => import("@/features/coach/CoachPage").then((module) => ({ default: module.CoachPage })));
const HomePage = lazy(() => import("@/features/home/HomePage").then((module) => ({ default: module.HomePage })));
const EconomyPage = lazy(() => import("@/features/matches/EconomyPage").then((module) => ({ default: module.EconomyPage })));
const MatchesPage = lazy(() => import("@/features/matches/MatchesPage").then((module) => ({ default: module.MatchesPage })));
const MatchPage = lazy(() => import("@/features/matches/MatchPage").then((module) => ({ default: module.MatchPage })));
const PlayerPage = lazy(() => import("@/features/players/PlayerPage").then((module) => ({ default: module.PlayerPage })));
const RoundPage = lazy(() => import("@/features/rounds/RoundPage").then((module) => ({ default: module.RoundPage })));
const PlayerSearchPage = lazy(() => import("@/features/search/PlayerSearch").then((module) => ({ default: module.PlayerSearchPage })));

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

  if (me.isLoading) return <p className="muted" role="status">{t("กำลังตรวจสอบการเข้าใช้งาน…")}</p>;
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return <p className="err" role="alert">{t("ติดต่อเซิร์ฟเวอร์ไม่ได้: {msg}", { msg: t((me.error as Error).message) })}</p>;
  }
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function AppRoutes() {
  const { t } = useT();
  return (
    <Suspense fallback={<p className="muted" role="status">{t("กำลังโหลด…")}</p>}>
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
    </Suspense>
  );
}
