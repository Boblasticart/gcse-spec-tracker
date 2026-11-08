import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectSaved, signIn, signUpAndVerify } from "./helpers";

const POINT = "Energy stores and transfers in a system";

async function openEnergyTopic(page: Page) {
  await page.goto("/spec/phy");
  await page.getByText("4.1 Energy", { exact: true }).click();
  return page.getByRole("group", { name: `Status of ${POINT}` });
}

test("a ticked point is saved to the account and shows on another browser", async ({ page, browser }, testInfo) => {
  const email = await signUpAndVerify(page);
  let status = await openEnergyTopic(page);
  await status.getByRole("button", { name: "Done", exact: true }).click();
  await expect(status.getByRole("button", { name: "Done", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expectSaved(page);

  await page.reload();
  await page.getByText("4.1 Energy", { exact: true }).click();
  status = page.getByRole("group", { name: `Status of ${POINT}` });
  await expect(status.getByRole("button", { name: "Done", exact: true })).toHaveAttribute("aria-pressed", "true");

  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page2 = await other.newPage();
  await signIn(page2, email, "/spec/phy");
  await page2.getByText("4.1 Energy", { exact: true }).click();
  const status2 = page2.getByRole("group", { name: `Status of ${POINT}` });
  await expect(status2.getByRole("button", { name: "Done", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A change on the second browser reaches the first one when it comes back into focus.
  await status2.getByRole("button", { name: "Needs work", exact: true }).click();
  await expectSaved(page2);
  await other.close();
  await page.reload();
  await page.getByText("4.1 Energy", { exact: true }).click();
  await expect(page.getByRole("group", { name: `Status of ${POINT}` }).getByRole("button", { name: "Needs work", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("signed-out visitors are asked to sign in when they tick a point", async ({ page }) => {
  const status = await openEnergyTopic(page);
  await status.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to track your progress" })).toBeVisible();
});

test("the old tracker's export file can be imported", async ({ page }) => {
  await signUpAndVerify(page);
  await page.getByLabel("Choose an export file to import").setInputFiles(join(process.cwd(), "tests", "fixtures", "tracker-export-small.json"));
  await expect(page.getByRole("status").filter({ hasText: "Imported 4 saved items." })).toBeVisible();
  await page.goto("/spec/bio");
  await page.getByText("4.1 Cell biology", { exact: true }).click();
  const point = page.getByRole("group", { name: "Status of Eukaryotic and prokaryotic cells" });
  await expect(point.getByRole("button", { name: "Done", exact: true })).toHaveAttribute("aria-pressed", "true");
});
