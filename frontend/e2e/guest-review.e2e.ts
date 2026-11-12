import { expect, test } from "@playwright/test";

// Requires a running API/PostgreSQL with a completed guest demo. No mocked API.
test("guest signs in, loads real matches, and opens round review", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const login = page.waitForResponse((r) => r.url().endsWith("/auth/guest") && r.request().method() === "POST");
  const matches = page.waitForResponse((r) => r.url().endsWith("/api/matches") && r.status() === 200);
  await page.getByTestId("guest-button").click();
  expect((await login).status()).toBe(200);
  const data = await (await matches).json();
  expect(data).toHaveLength(1);
  expect(data[0].status).toBe("done");
  await expect(page.getByTestId("matches-page")).toBeVisible();
  await expect(page.getByTestId("upload-button")).toHaveCount(0);
  await page.getByTestId("match-row").first().click();
  await expect(page).toHaveURL(/\/matches\/.+\/rounds\/1/);
  await expect(page.getByTestId("round-page")).toBeVisible();
  await expect(page.locator("svg image").first()).toBeVisible();
  expect(errors).toEqual([]);
});
