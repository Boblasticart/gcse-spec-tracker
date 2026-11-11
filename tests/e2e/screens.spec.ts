import { expect, test, type Page } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

/**
 * M6 screens: Spec, Improvement, Notes reader and Practice papers, one test per
 * group of legacy actions (see docs/PARITY.md).
 */

const POINT = "Energy stores and transfers in a system";
const ENERGY_POINTS = 9;

/** The open/close button of a topic, by topic id (phy.0 = 4.1 Energy, phy.1 = 4.2 Electricity). */
const topicButton = (page: Page, tid: string) => page.locator(`[data-topic="${tid}"] > button[aria-expanded]`);
const filterBar = (page: Page) => page.getByRole("toolbar", { name: "Filter spec points" });
const statusGroup = (page: Page, text: string) => page.getByRole("group", { name: `Status of ${text}` });

async function openTopic(page: Page, tid = "phy.0"): Promise<void> {
  const btn = topicButton(page, tid);
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
}

/** Saves docs straight to the account through the API (as the signed-in page). */
async function putDocs(page: Page, docs: Record<string, unknown>): Promise<void> {
  const origin = new URL(page.url()).origin;
  const res = await page.request.put("/api/docs", {
    headers: { Origin: origin },
    data: { changes: Object.entries(docs).map(([path, data]) => ({ path, data, baseVersion: 0 })) },
  });
  expect(res.ok()).toBe(true);
}

test("tab and view: subject tabs and view chips switch screens and keep the view", async ({ page }) => {
  await page.goto("/spec/phy");
  await page.getByRole("navigation", { name: "Subjects" }).getByRole("link", { name: /Biology/ }).click();
  await expect(page).toHaveURL(/\/spec\/bio$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Biology");
  await page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Practice papers" }).click();
  await expect(page).toHaveURL(/\/papers\/bio$/);
  await page.getByRole("navigation", { name: "Subjects" }).getByRole("link", { name: /Chemistry/ }).click();
  await expect(page).toHaveURL(/\/papers\/chem$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chemistry practice papers");
});

test("spec: filter, expand all, open a topic, set a status and bulk-mark a topic", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/spec/phy");
  await expect(page.getByTestId("summary-pct")).toHaveText("0%");

  // exp: Expand all opens every topic; Collapse all closes them.
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(topicButton(page, "phy.1")).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect(topicButton(page, "phy.0")).toHaveAttribute("aria-expanded", "false");

  // top + st
  await openTopic(page);
  await statusGroup(page, POINT).getByRole("button", { name: "Done", exact: true }).click();
  await expect(statusGroup(page, POINT).getByRole("button", { name: "Done", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(topicButton(page, "phy.0").getByTestId("topic-count")).toHaveText(`1/${ENERGY_POINTS} done`);
  await statusGroup(page, "Efficiency calculations").getByRole("button", { name: "Needs work", exact: true }).click();
  await expect(topicButton(page, "phy.0").getByTestId("topic-count")).toHaveText(`1/${ENERGY_POINTS} done · 1 to fix`);
  await expectSaved(page);

  // filter
  await filterBar(page).getByRole("button", { name: "Needs work", exact: true }).click();
  await expect(filterBar(page).getByRole("button", { name: "Needs work", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-point]")).toHaveCount(1);
  await expect(statusGroup(page, "Efficiency calculations")).toBeVisible();
  await filterBar(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("[data-point]")).toHaveCount(1);
  await expect(statusGroup(page, POINT)).toBeVisible();
  await filterBar(page).getByRole("button", { name: "All", exact: true }).click();

  // all: Mark all done, then Reset topic
  await openTopic(page);
  await page.locator('[data-topic="phy.0"]').getByRole("button", { name: "Mark all done" }).click();
  await expect(topicButton(page, "phy.0").getByTestId("topic-count")).toHaveText(`${ENERGY_POINTS}/${ENERGY_POINTS} done`);
  await expect(page.getByTestId("summary-legend")).toContainText(`${ENERGY_POINTS} done`);
  await expectSaved(page);
  await page.reload();
  await expect(topicButton(page, "phy.0").getByTestId("topic-count")).toHaveText(`${ENERGY_POINTS}/${ENERGY_POINTS} done`);
  await openTopic(page);
  await page.locator('[data-topic="phy.0"]').getByRole("button", { name: "Reset topic" }).click();
  await expect(topicButton(page, "phy.0").getByTestId("topic-count")).toHaveText(`0/${ENERGY_POINTS} done`);
  await expectSaved(page);
});

test("note and back: the reader renders prepared notes, marks them read and returns to the same place", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/spec/phy");
  await openTopic(page);
  await page.getByRole("link", { name: `Notes for ${POINT}` }).click();

  await expect(page).toHaveURL(/\/notes\/phy\.0\.0$/);
  await expect(page.getByRole("heading", { level: 1, name: POINT })).toBeVisible();
  await expect(page.getByText("Prepared notes, written to the specification.")).toBeVisible();
  await expect(page.getByText("What the spec asks.")).toBeVisible();
  // Figures are rebuilt by the sanitiser: real SVG, no scripts, no event handlers.
  const figure = page.locator("figure.note-fig svg").first();
  await expect(figure).toBeVisible();
  expect(await page.locator("figure.note-fig script, figure.note-fig foreignObject").count()).toBe(0);
  await expect(page.getByTestId("note-crumb")).toContainText(`1/${ENERGY_POINTS} read`);
  await expectSaved(page);

  // Next goes to the following point; the read count goes up.
  await page.getByRole("link", { name: /^Next: Kinetic/ }).click();
  await expect(page).toHaveURL(/\/notes\/phy\.0\.1$/);
  await expect(page.getByTestId("note-crumb")).toContainText(`2/${ENERGY_POINTS} read`);
  await expectSaved(page);

  await page.getByRole("button", { name: "← Back to spec" }).click();
  await expect(page).toHaveURL(/\/spec\/phy$/);
  await expect(topicButton(page, "phy.0")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: `Notes ✓ for ${POINT}` })).toBeVisible();
  await expect(page.locator('[data-topic="phy.0"]').getByTestId("quiz-meta")).toContainText(`2/${ENERGY_POINTS} notes read`);
});

test("note: signed-out visitors can read prepared notes; the last point offers the topic quiz", async ({ page }) => {
  await page.goto("/notes/phy.0.8");
  await expect(page.getByRole("heading", { level: 1, name: "Comparing reliability, cost and environmental impact" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quiz me on this topic" })).toHaveAttribute("href", "/quiz/phy.0");
  await page.getByRole("button", { name: "← Back to spec" }).click();
  await expect(page).toHaveURL(/\/spec\/phy$/);
});

test("pdone: practice papers can be marked attempted and it is saved", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/papers/phy");
  const paper = page.locator('[data-paper="Physics_4.1_Energy"]');
  await expect(paper.getByRole("link", { name: /Open PDF/ })).toHaveAttribute("href", "/papers/Physics_4.1_Energy.pdf");
  await paper.getByRole("button", { name: /Mark attempted/ }).click();
  await expect(paper.getByRole("button", { name: /Attempted/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("papers-intro")).toContainText("(1/15 so far)");
  await expectSaved(page);
  await page.reload();
  await expect(paper.getByRole("button", { name: /Attempted/ })).toHaveAttribute("aria-pressed", "true");
  await paper.getByRole("button", { name: /Attempted/ }).click();
  await expect(paper.getByRole("button", { name: /Mark attempted/ })).toHaveAttribute("aria-pressed", "false");
  await expectSaved(page);
});

test("pdone: signed-out visitors are asked to sign in", async ({ page }) => {
  await page.goto("/papers/phy");
  await page.locator('[data-paper="Physics_4.1_Energy"]').getByRole("button", { name: /Mark attempted/ }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to tick off practice papers" })).toBeVisible();
});

test("improve, master and more: three correct in a row asks for a decision", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/improve/phy");
  await expect(page.getByTestId("improve-empty")).toBeVisible();

  await putDocs(page, {
    "progress/phy": {
      s: { "phy.0.0": 1, "phy.0.6": 1, "phy.1.0": 1, "phy.0.2": 2 },
      c: {},
      m: {
        "phy.0.0": { b: 3, n: 3, c: 3, p: 1, d: "2026-11-20" },
        "phy.0.6": { b: 3, n: 4, c: 3, p: 1, d: "2026-11-21" },
        "phy.1.0": { b: 0, n: 1, c: 0, d: "2026-11-10" },
      },
      w: {},
      v: 2,
    },
  });
  await page.reload();
  await expect(page.getByTestId("improve-stats")).toContainText(/3\s*need work/);
  await expect(page.getByTestId("improve-stats")).toContainText("75%");
  const ready = page.getByRole("region", { name: "Ready for your decision" });
  await expect(ready.locator("[data-point]")).toHaveCount(2);

  // master
  await ready.getByRole("group", { name: /Decide on .*Energy stores/ }).getByRole("button", { name: "Mastered" }).click();
  await expect(ready.locator("[data-point]")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Mastered" }).locator('[data-point="phy.0.0"]')).toBeVisible();

  // more
  await ready.getByRole("group", { name: /Decide on .*Efficiency/ }).getByRole("button", { name: "More practice" }).click();
  await expect(page.getByRole("region", { name: "Ready for your decision" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Points to improve" }).locator('[data-point="phy.0.6"]')).toContainText("streak 2");
  await expectSaved(page);

  // back from a note opened in Improvement returns to Improvement
  await page.getByRole("link", { name: /Notes for .*Efficiency/ }).click();
  await expect(page).toHaveURL(/\/notes\/phy\.0\.6$/);
  await page.getByRole("button", { name: "← Back to Improvement" }).click();
  await expect(page).toHaveURL(/\/improve\/phy$/);
});
