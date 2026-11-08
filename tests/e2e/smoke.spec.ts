import { expect, test } from "@playwright/test";

test("home page lists every subject", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "GCSE Spec Tracker" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Subjects" }).getByRole("listitem")).toHaveCount(8);
});

test("legacy content is served at the old URLs", async ({ request }) => {
  const note = await request.get("/data/notes/bio.0.0.json");
  expect(note.ok()).toBe(true);
  const paper = await request.get("/papers/Physics_4.1_Energy.pdf");
  expect(paper.ok()).toBe(true);
  expect(paper.headers()["content-type"]).toContain("pdf");
});
