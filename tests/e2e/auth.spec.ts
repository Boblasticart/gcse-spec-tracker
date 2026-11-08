import { expect, test } from "@playwright/test";

import { alert, codeBoxes, PASSWORD, setClock, startSignUp, typeCode, uniqueEmail, waitForCode, wrongCode } from "./helpers";

test.afterEach(async ({ request }) => {
  await setClock(request, 0);
});

test("sign up, verify, use the dashboard, sign out, then get blocked", async ({ page }) => {
  const email = uniqueEmail();
  await startSignUp(page, email);
  await expect(page.getByText(email)).toBeVisible();
  const code = await waitForCode(email);
  await typeCode(page, code); // auto-submits on the sixth digit

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-email")).toHaveText(email);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fdashboard$/);

  // Signing back in returns to where they were going.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/auth\/verify/);
  await typeCode(page, await waitForCode(email, code));
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a paused session is still blocked from gated pages", async ({ page }) => {
  const email = uniqueEmail();
  await startSignUp(page, email);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/verify\?next=%2Fdashboard$/);
});

test("a wrong code shows a clear error and the right one still works", async ({ page }) => {
  const email = uniqueEmail();
  await startSignUp(page, email);
  const code = await waitForCode(email);
  await typeCode(page, wrongCode(code));
  await expect(alert(page, "That code isn't right")).toBeVisible();
  await expect(codeBoxes(page).first()).toHaveValue("");

  // Backspace moves back across boxes.
  await typeCode(page, "12");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(codeBoxes(page).nth(0)).toHaveValue("");
  await expect(codeBoxes(page).nth(1)).toHaveValue("");
  await expect(codeBoxes(page).nth(0)).toBeFocused();

  // Pasting a whole code into any box fills them all and submits.
  await codeBoxes(page).nth(2).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, `${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an expired code says so and a new code works", async ({ page, request }) => {
  const email = uniqueEmail();
  await startSignUp(page, email);
  const first = await waitForCode(email);
  await setClock(request, 11 * 60_000);
  await typeCode(page, first);
  await expect(alert(page, "This code has expired")).toBeVisible();

  const resend = page.getByRole("button", { name: "Send a new code" });
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByRole("status").filter({ hasText: "We've sent you a new code" })).toBeVisible();
  const second = await waitForCode(email, first);
  await typeCode(page, second);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("too many wrong codes kills the code until a new one is sent", async ({ page, request }) => {
  const email = uniqueEmail();
  await startSignUp(page, email);
  const code = await waitForCode(email);
  for (let i = 0; i < 4; i++) {
    await typeCode(page, wrongCode(code));
    await expect(alert(page, "That code isn't right")).toBeVisible();
  }
  await typeCode(page, wrongCode(code));
  await expect(alert(page, "Too many wrong codes")).toBeVisible();
  await expect(codeBoxes(page).first()).toBeDisabled();

  await setClock(request, 61_000);
  await page.getByRole("button", { name: "Send a new code" }).click();
  const fresh = await waitForCode(email, code);
  await typeCode(page, fresh);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signed-out visitors can browse, and gated buttons ask them to sign in", async ({ page }) => {
  await page.goto("/spec/phy");
  await expect(page.getByRole("heading", { level: 1, name: "Physics" })).toBeVisible();
  await page.getByText("4.1 Energy", { exact: true }).click();
  await page
    .getByRole("group", { name: "Status of Energy stores and transfers in a system" })
    .getByRole("button", { name: "Done", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Sign in to track your progress" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in?next=%2Fspec%2Fphy");
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/");
  await page.getByRole("link", { name: "Go to my dashboard" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to start tracking" })).toBeVisible();
});
