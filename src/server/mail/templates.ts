import type { MailMessage } from "./types";

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en-GB"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${bodyHtml}
<p style="font-size:12px;color:#78716c;margin-top:28px">GCSE Spec Tracker</p></div></body></html>`;
}

export function otpEmail(to: string, code: string, purpose: "SIGN_UP" | "SIGN_IN"): MailMessage {
  const action = purpose === "SIGN_UP" ? "finish making your account" : "sign in";
  const subject = `${code} is your GCSE Spec Tracker code`;
  const text = `Your code is ${code}\n\nEnter it to ${action}. It works for 10 minutes.\n\nIf this wasn't you, you can ignore this email. Nobody can get in without the code.`;
  const html = layout(
    "Your sign-in code",
    `<p>Enter this code to ${escapeHtml(action)}. It works for 10 minutes.</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0">${escapeHtml(code)}</p>
<p style="color:#57534e">If this wasn't you, you can ignore this email. Nobody can get in without the code.</p>`,
  );
  return { to, subject, text, html, kind: "otp", code };
}

export function accountExistsEmail(to: string, appUrl: string): MailMessage {
  const signIn = new URL("/auth/sign-in", appUrl).toString();
  const subject = "Someone tried to make an account with your email";
  const text = `Someone just tried to make a new GCSE Spec Tracker account using this email address, but you already have one.\n\nIf it was you, sign in instead: ${signIn}\n\nIf it wasn't you, you don't need to do anything. Your account is safe.`;
  const html = layout(
    "You already have an account",
    `<p>Someone just tried to make a new account using this email address, but you already have one.</p>
<p>If it was you, <a href="${escapeHtml(signIn)}">sign in instead</a>.</p>
<p style="color:#57534e">If it wasn't you, you don't need to do anything. Your account is safe.</p>`,
  );
  return { to, subject, text, html, kind: "account-exists" };
}
