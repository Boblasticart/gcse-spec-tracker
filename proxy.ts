import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, newNonce } from "@/lib/csp";
import { isGated, SESSION_COOKIE_NAMES } from "@/lib/gated";

/**
 * Cheap first check: no session cookie at all means straight to sign-in.
 * It also passes the path to server layouts so they can redirect back.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasCookie = SESSION_COOKIE_NAMES.some((n) => request.cookies.has(n));
  if (isGated(pathname) && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set("x-gst-path", pathname + search);
  // Per-request CSP nonce: Next.js reads the CSP request header and adds the nonce to its scripts.
  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development", https: (process.env.APP_URL ?? "").startsWith("https:") });
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/|api/|data/|papers/|content/|favicon.ico).*)"],
};
