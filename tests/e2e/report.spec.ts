import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { expectSaved, signUpAndVerify } from "./helpers";

/** M10: the progress PDF is built in the browser and downloads. */

async function pdfText(path: string): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)), disableFontFace: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}

test("Download progress PDF gives a report with the student's email and subjects", async ({ page }) => {
  const email = await signUpAndVerify(page);
  await page.goto("/spec/phy");
  await page.locator('[data-topic="phy.0"] > button[aria-expanded]').click();
  await page.getByRole("group", { name: "Status of Efficiency calculations" }).getByRole("button", { name: "Needs work", exact: true }).click();
  await expectSaved(page);
  await page.goto("/dashboard");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download progress PDF" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gcse-progress-\d{4}-\d{2}-\d{2}\.pdf$/);
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.byteLength).toBeGreaterThan(2000);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  const text = (await pdfText(path)).replace(/\s+/g, " ");
  expect(text).toContain(email);
  for (const name of ["Physics", "Biology", "Chemistry", "Maths", "Geography", "Business"]) expect(text).toContain(name);
  expect(text).toContain("Efficiency calculations");
});

test("the PDF can be made offline", async ({ page, context }) => {
  await signUpAndVerify(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expectSaved(page);
  await context.setOffline(true);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download progress PDF" }).click()]);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
