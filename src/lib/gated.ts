/** Pages that need a signed-in student. The real check happens on the server for each page. */
export const GATED_PREFIXES: readonly string[] = ["/dashboard", "/today", "/improve", "/quiz", "/review"];

export const SESSION_COOKIE_NAMES: readonly string[] = ["__Host-gst", "gst"];

export function isGated(pathname: string): boolean {
  return GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
