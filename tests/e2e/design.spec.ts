import { mkdirSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signUpAndVerify } from "./helpers";

declare global {
  interface Window {
    __classChanges: string[];
    __painted: boolean;
  }
}

/** Records every change to <html class> that happens after the first frame is painted. */
async function watchThemeClass(page: Page, stored?: string): Promise<void> {
  await page.addInitScript((theme) => {
    // Seed the stored theme once per tab, so reloads keep whatever the user picked.
    if (theme && !sessionStorage.getItem("seeded")) {
      localStorage.setItem("gst-theme", theme);
      sessionStorage.setItem("seeded", "1");
    }
    window.__classChanges = [];
    window.__painted = false;
    new MutationObserver(() => {
      if (window.__painted) window.__classChanges.push(document.documentElement.className);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    requestAnimationFrame(() => {
      window.__painted = true;
    });
  }, stored ?? null);
}

async function expectNoFlash(page: Page, dark: boolean): Promise<void> {
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => window.__classChanges)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(dark);
}

test.describe("theme", () => {
  test("a stored dark theme is applied before the first paint", async ({ page }) => {
    await watchThemeClass(page, "dark");
    await page.goto("/spec/phy");
    await expectNoFlash(page, true);
  });

  test("System follows the device setting without a flash", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, colorScheme: "dark" });
    const page = await ctx.newPage();
    await watchThemeClass(page);
    await page.goto("/");
    await expectNoFlash(page, true);
    await ctx.close();
  });

  test("light stays light, and the toggle switches and remembers", async ({ page }) => {
    await watchThemeClass(page, "light");
    await page.goto("/");
    await expectNoFlash(page, false);

    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    // Arrow keys move through the choices.
    await page.getByRole("radio", { name: "Dark" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Light" })).toBeFocused();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });
});

test.describe("accessibility", () => {
  async function expectNoSeriousIssues(page: Page, label: string): Promise<void> {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`),
      label,
    ).toEqual([]);
  }

  for (const theme of ["light", "dark"]) {
    test(`public pages have no serious axe issues (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("gst-theme", t), theme);
      for (const path of ["/", "/spec/phy", "/papers/bio", "/auth/sign-in", "/auth/sign-up"]) {
        await page.goto(path);
        if (path === "/spec/phy") await page.getByText("4.1 Energy", { exact: true }).click();
        await expectNoSeriousIssues(page, `${path} (${theme})`);
      }
    });
  }

  test("signed-in pages have no serious axe issues, and the skip link works", async ({ page }) => {
    await signUpAndVerify(page);
    await expectNoSeriousIssues(page, "/dashboard");
    await page.goto("/spec/chem");
    await page.getByText("4.3 Quantitative chemistry", { exact: true }).click();
    await expectNoSeriousIssues(page, "/spec/chem signed in");

    await page.goto("/spec/chem");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test("screenshots at 375 px and 1280 px", async ({ page }, testInfo) => {
  const dir = join(process.cwd(), "screenshots");
  mkdirSync(dir, { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((t) => localStorage.setItem("gst-theme", t), theme);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      for (const [name, path] of [
        ["home", "/"],
        ["spec", "/spec/phy"],
        ["sign-in", "/auth/sign-in"],
      ] as const) {
        await page.goto(path);
        if (name === "spec") await page.getByText("4.1 Energy", { exact: true }).click();
        const file = join(dir, `${name}-${width}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: name !== "spec" });
        await testInfo.attach(`${name}-${width}-${theme}`, { path: file, contentType: "image/png" });
      }
    }
  }
});
