import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("cs2.lang", "en");
    localStorage.setItem("cs2-untitled-theme", "dark");
  });
});

test("shows Home before sign-in, preserves the destination, and returns Home on logout", async ({ page }) => {
  await page.goto("/matches?review=opening");
  await expect(page.locator(".home-page")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe("/matches?review=opening");

  await page.locator(".home-hero .home-primary").click();
  await expect(page.getByTestId("login-card")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/matches?review=opening");
  await expect(page.locator(".brief-caption")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("de_mirage radar from the CS2 game files");

  await page.getByTestId("guest-button").click();
  await expect(page.getByTestId("matches-page")).toBeVisible();
  expect(new URL(page.url()).search).toBe("?review=opening");
  await page.getByTestId("user-menu").getByRole("button").click();
  await page.locator(".um-panel button.um-item").click();
  await expect(page.locator(".home-page")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("keeps direct Login and Steam error links usable and lets the logo return Home", async ({ page }) => {
  await page.goto("/login?err=steam");
  await expect(page.getByTestId("login-card")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".brief-caption")).toHaveCount(0);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".home-page")).toBeVisible();
});
