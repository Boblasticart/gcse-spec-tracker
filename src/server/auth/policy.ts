import { DAY, HOUR, MINUTE } from "../clock";

/** Every auth limit in one place (see PLAN.md, "Auth flow"). */
export const AUTH_POLICY = {
  pendingSessionMs: 15 * MINUTE,
  activeSessionMs: 30 * DAY,
  /** Active sessions are extended when they were last refreshed more than this long ago. */
  slideAfterMs: DAY,
  otpTtlMs: 10 * MINUTE,
  otpMaxAttempts: 5,
  resendCooldownMs: 60_000,
  resendMaxPerHour: 5,
  signInMaxFailures: 5,
  lockoutMs: 15 * MINUTE,
  signInIpMaxAttempts: 20,
  signInIpWindowMs: 15 * MINUTE,
  signUpPerEmailPerHour: 5,
  signUpPerIpPerHour: 20,
  accountExistsEmailEveryMs: HOUR,
} as const;
