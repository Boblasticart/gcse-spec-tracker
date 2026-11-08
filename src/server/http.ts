import "server-only";

import type { z } from "zod";

import { getEnv } from "./env";

/** Every API error has this shape. `code` is stable; `message` is shown to the student. */
export interface ApiError {
  ok: false;
  code: string;
  message: string;
  /** Seconds until trying again makes sense, for rate limits and cooldowns. */
  retryAfter?: number;
  attemptsLeft?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, code: string, message: string, extra: Partial<Pick<ApiError, "retryAfter" | "attemptsLeft">> = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = { ok: false, code, message, ...extra };
  }
}

export function json<T>(body: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(err: HttpError, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  if (err.body.retryAfter !== undefined) h.set("retry-after", String(err.body.retryAfter));
  return json(err.body, { status: err.status, headers: h });
}

/** Wraps a route handler so thrown HttpErrors become typed JSON and anything else a generic 500. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err);
      console.error("Unhandled API error", err);
      return errorResponse(new HttpError(500, "SERVER_ERROR", "Something went wrong on our side. Please try again."));
    }
  };
}

/** CSRF defence for state-changing requests: the Origin header must be our own origin. */
export function assertSameOrigin(request: Request): void {
  const expected = new URL(getEnv().APP_URL).origin;
  const origin = request.headers.get("origin");
  if (origin !== expected) {
    throw new HttpError(403, "BAD_ORIGIN", "This request did not come from the tracker. Reload the page and try again.");
  }
}

export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "BAD_JSON", "The request was not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, "INVALID_INPUT", first?.message ?? "Some details are missing or not valid.");
  }
  return parsed.data;
}

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

/** Client IP as reported by the hosting proxy (Vercel sets x-real-ip / x-forwarded-for). */
export function requestMeta(request: Request): RequestMeta {
  const real = request.headers.get("x-real-ip");
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = (real || forwarded || "unknown").slice(0, 64);
  const ua = request.headers.get("user-agent");
  return { ip, userAgent: ua ? ua.slice(0, 256) : null };
}
