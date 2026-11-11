"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { requestScrollRestore, uiActions, useUi } from "@/client/tracker/ui-state";
import { buttonClass } from "@/ui/button";

export const noteHref = (pid: string): Route => `/notes/${pid}` as Route;

/**
 * Opens the notes reader for a point (legacy `note`). From the Spec or
 * Improvement view it remembers where you were, so Back returns there.
 */
export function NoteLink({ pid, from, className, children }: { pid: string; from?: "spec" | "improve"; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href={noteHref(pid)}
      className={className}
      onClick={() => {
        if (from) uiActions.rememberBack(from, pathname);
      }}
    >
      {children}
    </Link>
  );
}

/** Legacy `back`: leave the reader for the view you came from, at the same scroll position. */
export function BackButton({ sid }: { sid: string }) {
  const router = useRouter();
  const back = useUi((s) => s.back);
  // Only go back to a view of this subject's tracker; otherwise the subject's spec.
  const target = back && back.href.endsWith(`/${sid}`) ? back : { href: `/spec/${sid}`, view: "spec" as const, y: 0 };
  return (
    <button
      type="button"
      className={buttonClass("secondary", "rounded-full px-3.5 py-1.5")}
      onClick={() => {
        requestScrollRestore(target.y);
        router.push(target.href as Route, { scroll: false });
      }}
    >
      ← Back to {target.view === "improve" ? "Improvement" : "spec"}
    </button>
  );
}
