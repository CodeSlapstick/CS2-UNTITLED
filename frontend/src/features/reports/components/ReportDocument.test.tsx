// @vitest-environment jsdom
import { createRef } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider, LangToggle } from "@/shared/i18n";
import type { ReportData } from "../types/report";
import { ReportDocument } from "./ReportDocument";
import { translateReportText } from "../utils/localizeReport";

afterEach(cleanup);

it("translates every item in a joined list of round evidence", () => {
  expect(translateReportText("รอบ 1 มีผู้เสียชีวิต 9 คน; รอบ 2 มีผู้เสียชีวิต 8 คน", "en"))
    .toBe("Round 1: 9 players died; Round 2: 8 players died");
});

it("switches report headings and generated analysis between Thai and English", () => {
  localStorage.setItem("cs2.lang", "th");
  const report: ReportData = {
    header: { match_id: 1, demo_file: "match.dem", report_type: "coach", player_id: null,
      player_name: null, team_a: "Alpha", team_b: "Bravo", map_name: "de_dust2", score_ct: 11,
      score_t: 9, rounds: 20, match_date: null, generated_at: "2026-11-11T12:00:00Z", dataset_version: "report-v1" },
    side: "all", executive_summary: ["วิเคราะห์ 20 รอบจากเดโม match.dem"], insights: [], kpis: [],
    turning_points: [], side_analysis: [], economy: [], players: [], training_plan: [], next_match_goals: [],
    data_quality: { demos: 1, rounds: 20, dataset_version: "report-v1", missing: [], estimated: [], warnings: [] },
  };
  render(<LangProvider><LangToggle /><ReportDocument report={report} documentRef={createRef()} /></LangProvider>);
  fireEvent.click(screen.getByRole("button", { name: "TH" }));
  expect(screen.getByText("ภาพรวมการแข่งขัน")).toBeTruthy();
  expect(screen.getByText("วิเคราะห์ 20 รอบจากเดโม match.dem")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByText("Match overview")).toBeTruthy();
  expect(screen.getByText("Analysis of 20 rounds from match.dem")).toBeTruthy();
  expect(screen.queryByText("ภาพรวมการแข่งขัน")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "TH" }));
  expect(screen.getByText("ภาพรวมการแข่งขัน")).toBeTruthy();
  expect(screen.getByText("วิเคราะห์ 20 รอบจากเดโม match.dem")).toBeTruthy();
});
