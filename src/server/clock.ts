import "server-only";

/**
 * The server's notion of "now". Everything time-based in auth (expiry,
 * cooldowns, rate limits) reads this, so tests can move time forward.
 * The offset lives on globalThis so every route bundle sees the same value.
 */
const g = globalThis as unknown as { __clockOffsetMs?: number };

export function now(): Date {
  return new Date(Date.now() + (g.__clockOffsetMs ?? 0));
}

export function clockOffsetMs(): number {
  return g.__clockOffsetMs ?? 0;
}

/** Moves the clock. Only for tests; callers must check {@link testClockAllowed}. */
export function setClockOffsetMs(ms: number): void {
  if (!Number.isFinite(ms)) throw new Error("Clock offset must be a finite number");
  g.__clockOffsetMs = ms;
}

/** The test clock is only ever available when explicitly enabled, and never on Vercel. */
export function testClockAllowed(): boolean {
  return process.env.ENABLE_TEST_CLOCK === "1" && !process.env.VERCEL;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}
