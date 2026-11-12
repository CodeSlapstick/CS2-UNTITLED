import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, matchesQuery } from "@/shared/api";

export type AnalysisMode = "upload" | "diff" | "opening";
export type AnalysisSide = "all" | "ct" | "t";

/** Keep match selection, filters and their queries together; null means all, [] means none. */
export function useDeathAnalysis(mode: AnalysisMode) {
  const [side, setSide] = useState<AnalysisSide>("all");
  const [demo, setDemo] = useState<string>(""); // "" = ทุกแมตช์ที่อัปโหลด
  const [hovered, setHovered] = useState<string | null>(null);
  const [selRounds, setSelRounds] = useState<number[] | null>(null);
  const [selPlayers, setSelPlayers] = useState<string[] | null>(null);
  const matches = useQuery(matchesQuery);
  const done = (matches.data ?? []).filter((m) => m.status === "done" && m.map_name);
  const upMaps = new Set(done.filter((m) => m.source === "upload").map((m) => m.map_name!));
  const maps = [...upMaps].sort();
  const [map, setMap] = useState<string>("");
  const activeMap = maps.includes(map) ? map : (maps[0] ?? "");
  const mapMatches = done.filter((m) => m.source === "upload" && m.map_name === activeMap);
  const selectedDemo = mapMatches.some((m) => m.demo_file === demo) ? demo : (mapMatches[0]?.demo_file ?? "");
  const activeMatch = mapMatches.find((m) => m.demo_file === selectedDemo);

  const roster = useQuery({
    queryKey: ["match-roster", activeMatch?.id],
    queryFn: () => api.match(activeMatch!.id),
    enabled: !!activeMatch,
    staleTime: 5 * 60_000,
  });
  const teamRoster = useQuery({
    queryKey: ["analysis-team-roster", selectedDemo],
    queryFn: () => api.heatmap(selectedDemo, "kills", "all", null, null),
    enabled: !!selectedDemo,
    staleTime: 5 * 60_000,
  });
  const teamIdentity = useQuery({
    queryKey: ["player-behavior", selectedDemo, null],
    queryFn: () => api.playerBehavior(selectedDemo, null),
    enabled: !!selectedDemo,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setSelRounds(null);
    setSelPlayers(null);
  }, [selectedDemo]);

  const noRoundsPicked = selRounds !== null && selRounds.length === 0;
  const noPlayersPicked = selPlayers !== null && selPlayers.length === 0;

  const enabled = !!activeMap && !noRoundsPicked && !noPlayersPicked;
  const upload = useQuery({
    queryKey: ["analysis", activeMap, "upload", side, selectedDemo, selRounds, selPlayers],
    queryFn: () => api.analysisDeaths(activeMap, "upload", side, selectedDemo || null, selRounds, selPlayers),
    enabled,
    staleTime: 5 * 60_000,
  });
  const reference = useQuery({
    queryKey: ["analysis", activeMap, "reference", side],
    queryFn: () => api.analysisDeaths(activeMap, "reference", side),
    enabled: enabled && mode === "diff",
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const target = selectedDemo;
  const behaviorQ = useQuery({
    queryKey: ["player-behavior", target, selPlayers],
    queryFn: () => api.playerBehavior(target, selPlayers),
    enabled: !!target && !noPlayersPicked,
    staleTime: 5 * 60_000,
  });

  useEffect(() => setHovered(null), [mode, activeMap, side, selectedDemo]);

  return {
    side, setSide, hovered, setHovered, selRounds, setSelRounds, selPlayers, setSelPlayers,
    matches, maps, mapMatches, activeMap, setMap, selectedDemo, setDemo, activeMatch,
    roster, teamRoster, teamIdentity, noRoundsPicked, noPlayersPicked, upload, reference, behaviorQ,
  };
}
