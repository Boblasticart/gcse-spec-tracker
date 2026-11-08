import type { Route } from "next";

/** The legacy tracker's four views per subject, as rebuild routes. */
export type ViewId = "spec" | "improve" | "today" | "papers";

export const VIEWS: readonly { id: ViewId; label: string; gated: boolean }[] = [
  { id: "spec", label: "Spec", gated: false },
  { id: "improve", label: "Improvement", gated: true },
  { id: "today", label: "Today's 7", gated: true },
  { id: "papers", label: "Practice papers", gated: false },
];

export function viewHref(view: ViewId, sid: string): Route {
  return `/${view}/${sid}` as Route;
}
