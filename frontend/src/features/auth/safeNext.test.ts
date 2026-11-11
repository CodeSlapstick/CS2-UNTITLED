import { describe, expect, it } from "vitest";

import { DEFAULT_AFTER_LOGIN, safeNext } from "@/features/auth/LoginPage";

describe("safeNext", () => {
  it("accepts internal paths", () => {
    expect(safeNext("/matches/1")).toBe("/matches/1");
    expect(safeNext("/analysis?tool=opening-route#rounds")).toBe("/analysis?tool=opening-route#rounds");
  });

  it("uses the match list for missing destinations, external URLs, and login loops", () => {
    for (const destination of [null, "", "https://example.com", "/login", "/login?next=/matches"]) {
      expect(safeNext(destination)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });

  it("rejects network paths, backslashes, and control characters", () => {
    expect(safeNext("//example.com")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNext("/\\example.com")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNext("/matches\n/1")).toBe(DEFAULT_AFTER_LOGIN);
  });
});
