import { expect, test, type Page } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

/**
 * M7 screens with the mocked AI (AI_MOCK=1): Today's 7, marking, retry,
 * 7 more, weakness review, topic quizzes and AI-written notes. The mock
 * gives full marks to any answer containing the word "correct".
 */

async function putDocs(page: Page, docs: Record<string, unknown>): Promise<void> {
  const res = await page.request.put("/api/docs", {
    headers: { Origin: new URL(page.url()).origin },
    data: { changes: Object.entries(docs).map(([path, data]) => ({ path, data, baseVersion: 0 })) },
  });
  expect(res.ok()).toBe(true);
}

const cards = (page: Page) => page.locator("article[data-question]");

async function answer(page: Page, index: number, text: string): Promise<void> {
  const card = cards(page).nth(index);
  await card.getByLabel("Your answer").fill(text);
  await card.getByRole("button", { name: "Submit for marking" }).click();
  await expect(card.getByTestId("mark-result")).toBeVisible();
}

test("gen, submit, retry, cancel, more7, review and dec on Today's 7", async ({ page }) => {
  await signUpAndVerify(page);
  await putDocs(page, { "progress/phy": { s: { "phy.0.0": 1 }, c: {}, m: {}, w: {}, v: 2 } });
  await page.goto("/today/phy");

  // gen
  await page.getByRole("button", { name: "Write today's 7 now" }).click();
  await expect(cards(page)).toHaveCount(7);
  await expect(page.getByTestId("today-done")).toHaveText("0/7");

  // submit (wrong), retry, cancel, then submit (right)
  await answer(page, 0, "no idea");
  const first = cards(page).nth(0);
  await expect(first.getByTestId("mark-result")).toContainText("0/2");
  await expect(first.getByTestId("mark-result")).toContainText("Not there yet");
  await expect(first.getByRole("listitem").filter({ hasText: "Missed: First marking point 1" })).toBeVisible();
  await first.getByRole("button", { name: "Try it again" }).click();
  await expect(first.getByLabel("Your answer")).toBeVisible();
  await first.getByRole("button", { name: "Cancel" }).click();
  await expect(first.getByLabel("Your answer")).toHaveCount(0);
  await first.getByRole("button", { name: "Try it again" }).click();
  await answer(page, 0, "the correct answer");
  await expect(first.getByTestId("mark-result")).toContainText("2/2");
  await expect(first.getByTestId("mark-result")).toContainText("Correct. Moving on.");
  await expect(page.getByTestId("today-done")).toHaveText("1/7");

  await answer(page, 1, "something wrong");
  await expect(page.getByTestId("today-done")).toHaveText("2/7");
  await expectSaved(page);

  // review + dec
  await page.getByRole("button", { name: "Review my weaknesses" }).click();
  const review = page.getByRole("region", { name: "Weakness review" });
  await expect(review.getByText("You missed a marking point.")).toBeVisible();
  await expect(review.getByText("Examiner tip:")).toBeVisible();
  const decide = review.getByRole("group", { name: /^Decide on / }).first();
  await decide.getByRole("button", { name: "Mastered" }).click();
  await expect(decide.getByRole("button", { name: "Mastered" })).toHaveAttribute("aria-pressed", "true");
  await decide.getByRole("button", { name: "Needs more work" }).click();
  await expect(decide.getByRole("button", { name: "Needs more work" })).toHaveAttribute("aria-pressed", "true");
  await expectSaved(page);
  await page.getByRole("button", { name: "Hide review" }).click();
  await expect(review).toHaveCount(0);

  // more7
  await page.getByRole("button", { name: "Give me 7 more" }).click();
  await expect(page.getByTestId("today-done")).not.toHaveText("2/7");
  expect(await cards(page).count()).toBeGreaterThan(7);
  await expectSaved(page);

  // Everything is in the account: a reload shows the same set and marks.
  await page.reload();
  await expect(cards(page).nth(0).getByTestId("mark-result")).toContainText("2/2");
});

test("quiz, submitquiz, retake and newquiz", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/quiz/phy.0");
  const boxes = page.getByRole("textbox");
  await expect(boxes).toHaveCount(10);

  await page.getByRole("button", { name: /^Submit quiz/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Type at least one answer first." })).toBeVisible();

  for (let i = 0; i < 8; i++) await boxes.nth(i).fill("correct");
  await page.getByRole("button", { name: "Submit quiz (20 marks)" }).click();
  await expect(page.getByTestId("quiz-result")).toContainText("16/20 · 80%");
  await expect(page.getByTestId("quiz-result")).toContainText("Topic finished.");
  await expectSaved(page);

  await page.getByRole("button", { name: "Try this quiz again" }).click();
  await expect(boxes.nth(0)).toHaveValue("");
  await boxes.nth(0).fill("correct");
  await page.getByRole("button", { name: /^Submit quiz/ }).click();
  await expect(page.getByTestId("quiz-result")).toContainText("2/20 · 10%");
  await expect(page.getByRole("heading", { name: "Re-read these notes" })).toBeVisible();
  await expectSaved(page);

  await page.goto("/spec/phy");
  await page.locator('[data-topic="phy.0"] > button[aria-expanded]').click();
  await expect(page.locator('[data-topic="phy.0"]').getByTestId("quiz-meta")).toContainText("last quiz 10%");
  await expect(page.locator('[data-topic="phy.0"]').getByTestId("topic-count")).toHaveText("0/9 done · 9 to fix");

  await page.goto("/quiz/phy.0");
  await expect(page.getByTestId("quiz-result")).toBeVisible();
  await page.getByRole("button", { name: "New quiz" }).click();
  await expect(page.getByTestId("quiz-result")).toHaveCount(0);
  await expect(boxes).toHaveCount(10);
  await expect(boxes.nth(0)).toHaveValue("");
});

test("wnote: a point with no prepared note gets notes written by AI and saved", async ({ page }) => {
  await signUpAndVerify(page);
  await page.goto("/notes/bus.0.0");
  await expect(page.getByText("Written by AI when you opened it.", { exact: false })).toBeVisible();
  await expect(page.getByText("Mock revision note.")).toBeVisible();
  await expect(page.getByTestId("note-crumb")).toContainText("1/4 read");
  await expectSaved(page);
  await page.reload();
  await expect(page.getByText("Mock revision note.")).toBeVisible();
});

test("perm: signed out, AI features ask you to sign in instead", async ({ page }) => {
  await page.goto("/notes/bus.0.0");
  await expect(page.getByTestId("note-missing")).toContainText("Sign in to see notes saved to your account.");
  await page.getByTestId("note-missing").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to see your notes" })).toBeVisible();
  await page.goto("/today/phy");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Ftoday%2Fphy/);
});
