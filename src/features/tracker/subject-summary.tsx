"use client";

import { useMemo } from "react";

import { useSession } from "@/client/session";
import { useDoc } from "@/client/sync/react";
import { countStatuses } from "@/client/tracker/progress";
import { allPoints, getSubject } from "@/content";
import { pct } from "@/lib/dates";

import { StatusBar } from "./status-bar";

/** The legacy summary card above the Spec and Improvement views: % done, bar and legend. */
export function SubjectSummary({ sid }: { sid: string }) {
  const subject = getSubject(sid);
  const { user } = useSession();
  const progress = useDoc(`progress/${sid}`);
  const ids = useMemo(() => (subject ? allPoints(subject).map((p) => p.id) : []), [subject]);
  if (!subject) return null;
  const c = countStatuses(user ? progress : undefined, ids);
  const total = ids.length;
  return (
    <section aria-label={`${subject.name} progress`} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        {subject.board} {subject.name}
      </h1>
      <p className="text-sm text-muted">
        {subject.code} · {total} spec points
      </p>
      <p className="mt-4 flex items-baseline gap-2">
        <strong className="font-heading text-4xl font-bold tabular-nums" data-testid="summary-pct">
          {pct(c[2], total)}%
        </strong>
        <span className="text-sm text-muted">of the spec marked done</span>
      </p>
      <StatusBar counts={c} className="mt-3" />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" data-testid="summary-legend">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-done" />
          {c[2]} done
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-work" />
          {c[1]} done, need work
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-subtle ring-1 ring-line-strong" />
          {c[0]} not done
        </li>
      </ul>
    </section>
  );
}
