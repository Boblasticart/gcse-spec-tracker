/** Typed fetch for our own JSON API. Never throws: failures come back as `{ ok: false }`. */

export interface ApiFailure {
  ok: false;
  code: string;
  message: string;
  retryAfter?: number;
  status: number;
}

export type ApiResult<T> = (T & { ok: true }) | ApiFailure;

export async function api<T extends object>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "NETWORK", message: "Can't reach the tracker. Check your internet connection.", status: 0 };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok && data && typeof data === "object" && (data as { ok?: unknown }).ok === true) {
    return data as T & { ok: true };
  }
  const err = (data ?? {}) as Partial<ApiFailure>;
  return {
    ok: false,
    code: typeof err.code === "string" ? err.code : "SERVER_ERROR",
    message: typeof err.message === "string" ? err.message : "Something went wrong. Please try again.",
    retryAfter: typeof err.retryAfter === "number" ? err.retryAfter : undefined,
    status: res.status,
  };
}
