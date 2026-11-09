// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LangProvider } from "@/shared/i18n";
import { MatchesPage } from "./MatchesPage";

let client: QueryClient;

afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

function renderUpload(status: number) {
  let uploaded = false;
  let submitted: FormData | undefined;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/demos") {
      submitted = init?.body as FormData;
      uploaded = true;
      const body = status === 202
        ? { match_id: 42, demo_file: "match.dem", size_mb: 0, status: "queued", job_id: "job-42" }
        : { detail: status === 409 ? "แมตช์ match.dem มีอยู่ในระบบแล้ว" : "ส่งงานเข้าคิวไม่ได้" };
      return new Response(JSON.stringify(body), { status });
    }
    if (url === "/api/matches") {
      const matches = uploaded && status === 503
        ? [{ id: 42, demo_file: "match.dem", status: "error", rounds: 0, map_name: null }]
        : [];
      return new Response(JSON.stringify(matches));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["matches"], []);
  client.setQueryData(["me"], { user: { type: "steam", id: 7, username: "tester" } });
  render(
    <QueryClientProvider client={client}>
      <LangProvider><MemoryRouter><MatchesPage /></MemoryRouter></LangProvider>
    </QueryClientProvider>,
  );
  const file = new File(["PBDEMS2\0demo"], "match.dem");
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
  return { getSubmitted: () => submitted, file, fetchMock };
}

it("uploads only the file and displays the queued result", async () => {
  const { getSubmitted, file } = renderUpload(202);
  expect(await screen.findByText("เข้าคิวแล้ว กำลังรอแกะ")).toBeTruthy();
  expect(getSubmitted()?.get("file")).toBe(file);
  expect(getSubmitted()?.has("force")).toBe(false);
});

it("explains duplicates without an overwrite action", async () => {
  const { fetchMock } = renderUpload(409);
  expect(await screen.findByText("มีแมตช์นี้ในระบบแล้ว — หากต้องการอัปโหลดใหม่ ให้ลบแมตช์เดิมก่อน")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "โหลดทับของเดิม" })).toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/demos")).toHaveLength(1);
});

it("refreshes matches after a queue failure so the error match can be deleted", async () => {
  renderUpload(503);
  expect(await screen.findByText("ส่งงานเข้าคิวไม่ได้")).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("match-row").getAttribute("data-demo")).toBe("match.dem"));
  expect(screen.getByRole("button", { name: "ลบเดโม match.dem" })).toBeTruthy();
});
