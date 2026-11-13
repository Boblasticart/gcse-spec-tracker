import { expect, test } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

// The note file below is faked with page.route, which can't see service-worker fetches.
test.use({ serviceWorkers: "block" });

/**
 * J1: choosing an exam board per subject. Uses the made-up CI specs in
 * src/content/fixture-specs.ts (Physics "Testboard TB100", French "TB200 Higher").
 */
test("switching a subject's board shows that spec and keeps earlier progress", async ({ page }) => {
  await signUpAndVerify(page);
  const boards = page.locator("#boards");
  await expect(boards.getByRole("heading", { name: "Check your subjects and exam boards" })).toBeVisible();
  await expect(boards.getByLabel("Physics", { exact: true })).toHaveValue("phy");
  await expect(boards.getByLabel("French", { exact: true })).toHaveValue("");

  // Some progress on the default (AQA) Physics spec.
  await page.goto("/spec/phy");
  await page.locator('[data-topic="phy.0"] > button[aria-expanded]').click();
  await page.locator('[data-topic="phy.0"]').getByRole("button", { name: "Mark all done" }).click();
  await expectSaved(page);

  // Switch Physics to another board and start French.
  await page.goto("/dashboard");
  await page.locator("#boards").getByLabel("Physics", { exact: true }).selectOption("phy_fixture");
  await page.locator("#boards").getByLabel("French", { exact: true }).selectOption("fr_fixture");
  await expectSaved(page);
  await expect(page.getByRole("heading", { name: "Your subjects and exam boards" })).toBeVisible();
  await expect(page.locator('[data-subject="phy_fixture"]').getByTestId("subject-counts")).toHaveText(/^0 done · 0 need work · 3 points$/);
  await expect(page.locator('[data-subject="phy"]')).toHaveCount(0);
  await expect(page.locator('[data-subject="fr_fixture"]')).toBeVisible();

  // The subject tabs follow the choice and show that spec's topics.
  await page.goto("/spec/bio");
  const tabs = page.getByRole("navigation", { name: "Subjects" });
  await tabs.getByRole("link", { name: /^Physics/ }).click();
  await expect(page).toHaveURL(/\/spec\/phy_fixture$/);
  await expect(page.getByText("Fixture topic: Waves")).toBeVisible();
  await expect(page.getByText("4.1 Energy")).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: /^French/ })).toBeVisible();

  // Catalogue notes come from one static file per topic.
  await page.route("**/content/notes/phy_fixture/0.json", (route) =>
    route.fulfill({ json: { "phy_fixture.0.0": { summary: "Wave speed equals frequency times wavelength." } } }),
  );
  await page.goto("/notes/phy_fixture.0.0");
  await expect(page.getByText("Wave speed equals frequency times wavelength.")).toBeVisible();

  // Switching back: the AQA progress is untouched.
  await page.goto("/dashboard");
  await page.locator("#boards").getByLabel("Physics", { exact: true }).selectOption("phy");
  await expectSaved(page);
  await expect(page.locator('[data-subject="phy"]').getByTestId("subject-counts")).toHaveText(/^9 done · 0 need work · \d+ points$/);
});
