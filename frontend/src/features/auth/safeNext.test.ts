import { describe, expect, it } from "vitest";

import { DEFAULT_AFTER_LOGIN, safeNext } from "@/features/auth/LoginPage";

describe("safeNext", () => {
  it("accepts internal paths", () => {
    expect(safeNext("/matches/1")).toBe("/matches/1");
  });

  it("rejects network paths, backslashes, and control characters", () => {
    expect(safeNext("//example.com")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNext("/\\example.com")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNext("/matches\n/1")).toBe(DEFAULT_AFTER_LOGIN);
  });
});
