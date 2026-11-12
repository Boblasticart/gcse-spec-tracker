import { expect, test, type Page } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

/**
 * Phone layout: at 360 px (small Android) and 390 px (iPhone) wide, no page may
 * scroll sideways and nothing may stick out past the screen edge (except inside
 * containers built to scroll sideways, like the subject tabs and wide tables).
 */

const WIDTHS = [360, 390] as const;

interface Overflow {
  tag: string;
  text: string;
  cls: string;
  right: number;
  width: number;
}

/** Elements poking out past the right edge, ignoring ones inside sideways-scrolling boxes. */
async function overflowing(page: Page): Promise<{ scrollWidth: number; width: number; items: Overflow[] }> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const scrollsSideways = (el: Element): boolean => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === "auto" || ox === "scroll" || ox === "hidden") && p !== document.body && p !== document.documentElement) return true;
      }
      return false;
    };
    const items: Overflow[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > width + 1 && !scrollsSideways(el)) {
        items.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 40),
          cls: (el.getAttribute("class") ?? "").slice(0, 80),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, width, items: items.slice(0, 12) };
  });
}

async function check(page: Page, name: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const report = await overflowing(page);
  // Printed so the layout can be checked from the CI log.
  console.log(`MOBILE ${name} @${report.width}: scrollWidth=${report.scrollWidth} ${JSON.stringify(report.items)}`);
  if (process.env.MOBILE_SHOTS === "1" && report.width === 390) {
    const h = await page.evaluate(() => Math.min(document.documentElement.scrollHeight, 2400));
    const jpg = await page.screenshot({ type: "jpeg", quality: 45, clip: { x: 0, y: 0, width: 390, height: h }, fullPage: true });
    const b64 = jpg.toString("base64");
    for (let i = 0; i < b64.length; i += 4000) console.log(`SHOT ${name} ${i / 4000} ${b64.slice(i, i + 4000)}`);
  }
  expect(report.scrollWidth, `${name} scrolls sideways`).toBeLessThanOrEqual(report.width);
  expect(report.items, `${name} has boxes wider than the screen`).toEqual([]);
}

for (const width of WIDTHS) {
  test.describe(`phone ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });

    test("signed-out pages fit the screen", async ({ page }) => {
      for (const path of ["/", "/auth/sign-in", "/auth/sign-up", "/papers/phy", "/notes/phy.0.0", "/notes/eng.4.0"]) {
        await page.goto(path);
        await check(page, path);
      }
      await page.goto("/spec/phy");
      await page.locator('[data-topic="phy.0"] > button[aria-expanded]').click();
      await check(page, "/spec/phy (open topic)");
    });

    test("signed-in pages fit the screen", async ({ page }) => {
      await signUpAndVerify(page);
      await check(page, "/dashboard");
      await page.goto("/spec/phy");
      await page.locator('[data-topic="phy.0"] > button[aria-expanded]').click();
      await page.getByRole("group", { name: "Status of Efficiency calculations" }).getByRole("button", { name: "Needs work", exact: true }).click();
      await expectSaved(page);
      await check(page, "/spec/phy signed in");
      await page.goto("/today/phy");
      await page.getByRole("button", { name: "Write today's 7 now" }).click();
      await expect(page.locator("article[data-question]")).toHaveCount(7);
      await check(page, "/today/phy");
      await page.goto("/improve/phy");
      await check(page, "/improve/phy");
      await page.goto("/quiz/phy.0");
      await expect(page.getByRole("textbox")).toHaveCount(10);
      await check(page, "/quiz/phy.0");
      await page.goto("/papers/phy");
      await check(page, "/papers/phy signed in");
    });
  });
}
