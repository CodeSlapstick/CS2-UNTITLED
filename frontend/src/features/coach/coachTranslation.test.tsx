// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalysisReportExport } from "@/features/analysis/AnalysisReportExport";
import { LangProvider, LangToggle } from "@/shared/i18n";

afterEach(cleanup);

it("updates Coach report controls when switching between Thai and English", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LangProvider><LangToggle /><AnalysisReportExport /></LangProvider></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("heading", { name: "Download reports" })).toBeTruthy();
  expect(screen.getByText("No match selected")).toBeTruthy();
  expect(screen.getByRole("option", { name: "Both sides" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "TH" }));
  expect(screen.getByRole("heading", { name: "ดาวน์โหลดรายงาน" })).toBeTruthy();
  expect(screen.getByText("ยังไม่ได้เลือกแมตช์")).toBeTruthy();
});
