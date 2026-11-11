import { expect, test, type Page } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

/** M9: installable, works offline, and sends offline changes when back online. */

const POINT = "Energy stores and transfers in a system";
const OTHER = "Efficiency calculations";
const status = (page: Page, text: string, label: string) =>
  page.getByRole("group", { name: `Status of ${text}` }).getByRole("button", { name: label, exact: true });

async function openEnergy(page: Page): Promise<void> {
  const btn = page.locator('[data-topic="phy.0"] > button[aria-expanded]');
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
}

test("the manifest and service worker are served", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const m = (await manifest.json()) as { name: string; icons: { src: string }[] };
  expect(m.name).toBe("GCSE Spec Tracker");
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
});

test("offline: ticks are kept, the app reloads offline, and they reach the account when back online", async ({ page, context }) => {
  await signUpAndVerify(page);
  await page.goto("/spec/phy");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once the worker is in control, so this page is cached for offline use.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expectSaved(page);

  await context.setOffline(true);
  await openEnergy(page);
  await status(page, POINT, "Done").click();
  await status(page, OTHER, "Needs work").click();
  const sync = page.getByTestId("sync-status");
  await expect(sync).toHaveAttribute("data-state", "offline");
  await expect(sync).toHaveText("Offline: 1 change waiting");

  // The app still opens with no connection, showing the waiting changes.
  await page.reload();
  await openEnergy(page);
  await expect(status(page, POINT, "Done")).toHaveAttribute("aria-pressed", "true");
  await expect(status(page, OTHER, "Needs work")).toHaveAttribute("aria-pressed", "true");
  await expect(sync).toHaveText("Offline: 1 change waiting");

  // A page never opened before shows the offline page.
  await page.goto("/spec/geo");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await page.goBack();
  await openEnergy(page);

  await context.setOffline(false);
  await expectSaved(page);
  const res = await page.request.get("/api/docs");
  const body = (await res.json()) as { docs: { path: string; data: { s: Record<string, number> } }[] };
  const phy = body.docs.find((d) => d.path === "progress/phy");
  expect(phy?.data.s).toEqual({ "phy.0.0": 2, "phy.0.6": 1 });
});
