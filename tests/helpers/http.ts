import { randomUUID } from "node:crypto";

import { memoryOutbox } from "@/server/mail/transports";

export const ORIGIN = "http://localhost:3000";

/** The CI Postgres is required in CI; locally, DB tests are skipped without DATABASE_URL. */
export const hasDb = !!process.env.DATABASE_URL;
if (process.env.CI && !hasDb) throw new Error("DATABASE_URL must be set in CI");

export const uniqueEmail = (tag = "user"): string => `${tag}-${randomUUID().slice(0, 8)}@example.test`;
export const uniqueIp = (): string => `10.${rand()}.${rand()}.${rand()}`;
const rand = (): number => Math.floor(Math.random() * 254) + 1;

export interface Client {
  ip: string;
  cookie?: string;
  /** Sends a request with this client's cookie and IP, keeping any Set-Cookie it gets back. */
  call(route: (r: Request) => Promise<Response>, init?: CallInit): Promise<Response>;
}

export interface CallInit {
  method?: string;
  body?: unknown;
  origin?: string | null;
  path?: string;
}

export function client(ip = uniqueIp()): Client {
  const c: Client = {
    ip,
    async call(route, init = {}) {
      const headers = new Headers({ "x-forwarded-for": c.ip, "user-agent": "vitest" });
      const method = init.method ?? (init.body === undefined ? "GET" : "POST");
      if (init.origin !== null && method !== "GET") headers.set("origin", init.origin ?? ORIGIN);
      if (c.cookie) headers.set("cookie", c.cookie);
      if (init.body !== undefined) headers.set("content-type", "application/json");
      const req = new Request(`${ORIGIN}${init.path ?? "/api/test"}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const res = await route(req);
      const set = res.headers.get("set-cookie");
      if (set) {
        const pair = set.split(";")[0] ?? "";
        c.cookie = pair.endsWith("=") ? undefined : pair;
      }
      return res;
    },
  };
  return c;
}

export async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.clone().json()) as T;
}

/** Latest OTP code emailed to this address (from the in-memory outbox). */
export function lastCode(email: string): string {
  const mail = [...memoryOutbox()].reverse().find((m) => m.to === email && m.kind === "otp");
  if (!mail?.code) throw new Error(`No code emailed to ${email}`);
  return mail.code;
}

export function mailTo(email: string) {
  return memoryOutbox().filter((m) => m.to === email);
}

/** A different 6-digit code from `code`. */
export const wrongCode = (code: string): string => (code === "000000" ? "111111" : "000000");
