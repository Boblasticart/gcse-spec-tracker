import Link from "next/link";

import { cn } from "@/ui/cn";

import { VIEWS, viewHref, type ViewId } from "./views";

/** View chips (legacy `view`): Spec, Improvement, Today's 7, Practice papers. */
export function ViewNav({ sid, current }: { sid: string; current: ViewId }) {
  return (
    <nav aria-label="Views" className="mt-4">
      <ul className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <li key={v.id}>
            <Link
              href={viewHref(v.id, sid)}
              aria-current={v.id === current ? "page" : undefined}
              className={cn(
                "inline-flex rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                v.id === current ? "border-transparent bg-fg text-bg" : "border-line text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {v.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
