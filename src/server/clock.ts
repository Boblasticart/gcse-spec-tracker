import "server-only";

/**
 * The server's notion of "now". Everything time-based in auth (expiry,
 * cooldowns, rate limits) reads this, so tests can move time forward.
 */
let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

export function clockOffsetMs(): number {
  return offsetMs;
}

/** Moves the clock. Only for tests; the caller must check that test mode is allowed. */
export function setClockOffsetMs(ms: number): void {
  if (!Number.isFinite(ms)) throw new Error("Clock offset must be a finite number");
  offsetMs = ms;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}
