import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "purple turtles dance at noon";
const MAIL_DIR = join(process.cwd(), process.env.MAIL_DIR ?? ".mail");

export const uniqueEmail = (tag = "e2e"): string => `${tag}-${randomUUID().slice(0, 8)}@example.test`;

interface StoredMail {
  to: string;
  kind: string;
  code?: string;
  sentAt: string;
}

async function mailsTo(email: string): Promise<StoredMail[]> {
  let names: string[] = [];
  try {
    names = await readdir(MAIL_DIR);
  } catch {
    return [];
  }
  const all = await Promise.all(
    names.filter((n) => n.endsWith(".json")).map(async (n) => JSON.parse(await readFile(join(MAIL_DIR, n), "utf8")) as StoredMail),
  );
  return all.filter((m) => m.to === email).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

/** Waits for the newest code emailed to `email` (optionally one different from `not`). */
export async function waitForCode(email: string, not?: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const otp = (await mailsTo(email)).filter((m) => m.kind === "otp" && m.code && m.code !== not).at(-1);
        code = otp?.code;
        return code;
      },
      { timeout: 10_000, message: `waiting for a code to ${email}` },
    )
    .toBeTruthy();
  return code as string;
}

export async function setClock(request: APIRequestContext, offsetMs: number): Promise<void> {
  const res = await request.post("/api/test/clock", { data: { offsetMs } });
  expect(res.ok()).toBe(true);
}

export function codeBoxes(page: Page) {
  return page.getByRole("group", { name: "6-digit code" }).getByRole("textbox");
}

export async function typeCode(page: Page, code: string): Promise<void> {
  await codeBoxes(page).first().click();
  await page.keyboard.type(code);
}

/** Fills the sign-up form and lands on the code screen. */
export async function startSignUp(page: Page, email: string, next?: string): Promise<void> {
  await page.goto(next ? `/auth/sign-up?next=${encodeURIComponent(next)}` : "/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Make my account" }).click();
  await expect(page).toHaveURL(/\/auth\/verify/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

export const wrongCode = (code: string): string => (code === "000000" ? "111111" : "000000");

/** A form alert with this text (Next.js has its own hidden route-announcer alert too). */
export function alert(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}
