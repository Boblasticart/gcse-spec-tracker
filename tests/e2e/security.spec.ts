import { expect, test, type Page } from "@playwright/test";

import { signUpAndVerify } from "./helpers";

/** M11: security headers, a working nonce CSP, account export and deletion, error pages. */

declare global {
  interface Window {
    __csp: string[];
  }
}

async function watchCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}

const violations = (page: Page) => page.evaluate(() => window.__csp);

test("pages send a nonce CSP and hardening headers; APIs are locked down", async ({ request }) => {
  const res = await request.get("/spec/phy");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(res.headers()["permissions-policy"]).toContain("camera=()");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(await res.text()).toContain(`nonce="${nonce}"`);
  // A second request gets a different nonce.
  const again = (await request.get("/spec/phy")).headers()["content-security-policy"];
  expect(again).not.toBe(csp);

  const api = await request.get("/api/auth/me");
  expect(api.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
});

test("no CSP violations across the app, including notes figures, the theme script and the PDF", async ({ page }) => {
  await watchCsp(page);
  await signUpAndVerify(page);
  for (const path of ["/", "/spec/phy", "/notes/phy.0.0", "/papers/phy", "/today/phy", "/improve/phy", "/dashboard"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations(page), path).toEqual([]);
  }
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download progress PDF" }).click()]);
  expect(await download.path()).toBeTruthy();
  expect(await violations(page)).toEqual([]);
});

test("account: download all my data, then delete the account", async ({ page }) => {
  const email = await signUpAndVerify(page);
  const exported = await page.request.get("/api/account/export");
  expect(exported.ok()).toBe(true);
  expect(((await exported.json()) as { account: { email: string } }).account.email).toBe(email);

  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Type your password to confirm").fill("not the right password");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That password isn't right" })).toBeVisible();
  await page.getByLabel("Type your password to confirm").fill("purple turtles dance at noon");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get("/api/account/export")).status()).toBe(401);

  // The account is gone: signing in with it fails.
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("purple turtles dance at noon");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/auth\/verify/);
});

test("unknown pages show a friendly 404", async ({ page }) => {
  const res = await page.goto("/spec/not-a-subject");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible();
});
