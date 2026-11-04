import { useQuery } from "@tanstack/react-query";
import { reportApi } from "@/features/reports/services/reportApi";
import type { ReportSide, ReportType } from "@/features/reports/types/report";

export function useReport(matchId: number | undefined, type: ReportType, side: ReportSide, playerId?: string, enabled = true) {
  return useQuery({
    queryKey: ["performance-report", matchId, type, side, playerId],
    queryFn: ({ signal }) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      return reportApi.getReport(matchId!, type, side, playerId, signal);
    },
    enabled: enabled && !!matchId && (type === "coach" || !!playerId),
    staleTime: 5 * 60_000,
  });
}
