import { NextResponse, type NextRequest } from "next/server";

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
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|api/|data/|papers/|favicon.ico).*)"],
};
