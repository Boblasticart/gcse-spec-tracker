"use client";

import Link from "next/link";

import { useSession } from "@/client/session";
import { useDocs } from "@/client/sync/react";
import { countStatuses } from "@/client/tracker/progress";
import { useChosenSpecs } from "@/client/tracker/specs";
import { allPoints, CATALOGUE } from "@/content";
import { pct } from "@/lib/dates";
import { cn } from "@/ui/cn";

import { viewHref, type ViewId } from "./views";

const POINT_IDS: Readonly<Record<string, string[]>> = Object.fromEntries(CATALOGUE.map((s) => [s.id, allPoints(s).map((p) => p.id)]));

/** Subject tabs (legacy `tab`): one link per subject, keeping the current view, with % done when signed in. */
export function SubjectNav({ current, view }: { current: string; view: ViewId }) {
  const { user } = useSession();
  const docs = useDocs((s) => s.docs);
  const specs = useChosenSpecs();
  return (
    <nav aria-label="Subjects" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <ul className="flex min-w-max gap-1.5">
        {specs.map((s) => {
          const ids = POINT_IDS[s.id] ?? [];
          const done = countStatuses(docs[`progress/${s.id}`]?.data, ids)[2];
          const active = s.id === current;
          return (
            <li key={s.id}>
              <Link
                href={viewHref(view, s.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col rounded-xl border px-3 py-2 text-left transition hover:-translate-y-px motion-reduce:hover:translate-y-0",
                  active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong hover:shadow-card",
                )}
              >
                <span className="text-sm font-semibold">{s.name}</span>
                <span className="text-xs text-muted">{user ? `${pct(done, ids.length)}% done` : `${s.board}`}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
