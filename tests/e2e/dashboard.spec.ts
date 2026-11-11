import { expect, test } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

/** M8: the live progress dashboard. */

test("ticking points changes the dashboard numbers, animated", async ({ page }) => {
  await signUpAndVerify(page);
  const phy = page.locator('[data-subject="phy"]');
  await expect(phy.getByRole("img", { name: "Physics: 0% done" })).toBeVisible();
  await expect(page.getByTestId("stat-answered")).toHaveText("0");

  await page.goto("/spec/phy");
  await page.locator('[data-topic="phy.0"] > button[aria-expanded]').click();
  await page.locator('[data-topic="phy.0"]').getByRole("button", { name: "Mark all done" }).click();
  await page
    .getByRole("group", { name: "Status of Power and energy transfer" })
    .getByRole("button", { name: "Needs work", exact: true })
    .click();
  await expectSaved(page);

  await page.getByRole("link", { name: /dashboard/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // The arc animates from empty to its value rather than jumping.
  const arc = phy.locator("[data-ring-arc]");
  const first = await arc.evaluate((el) => getComputedStyle(el).strokeDashoffset);
  await expect(phy.getByRole("img", { name: /^Physics: [1-9]\d*% done$/ })).toBeVisible();
  await expect(phy.getByTestId("subject-counts")).toHaveText(/^8 done · 1 need work · \d+ points$/);
  await expect.poll(async () => arc.evaluate((el) => getComputedStyle(el).strokeDashoffset)).not.toBe(first);
  await expect(page.getByTestId("overall-counts")).toContainText("8 done · 1 need work");
});

test("study time on Today's 7 is saved to stats/time and shown on the dashboard", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/today/phy");
  await expect(page.getByText(/Nothing in Physics is covered yet/)).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(100 + i * 10, 200);
    await page.waitForTimeout(1000);
  }
  // Leaving the screen saves the time.
  await page.getByRole("link", { name: /dashboard/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("stat-time")).not.toHaveAttribute("data-seconds", "0");
  await expectSaved(page);
  const res = await page.request.get("/api/docs");
  const body = (await res.json()) as { docs: { path: string; data: { days: Record<string, number> } }[] };
  const time = body.docs.find((d) => d.path === "stats/time");
  expect(Object.values(time?.data.days ?? {})[0]).toBeGreaterThanOrEqual(2);
});

test("reduced motion: the dashboard shows final numbers straight away", async ({ browser }, testInfo) => {
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await signUpAndVerify(page);
  await expect(page.getByTestId("stat-streak")).toHaveText("0");
  await ctx.close();
});
