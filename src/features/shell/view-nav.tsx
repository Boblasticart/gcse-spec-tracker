import Link from "next/link";

import { cn } from "@/ui/cn";

import { VIEWS, viewHref, type ViewId } from "./views";

/** View chips (legacy `view`): Spec, Improvement, Today's 7, Practice papers. */
export function ViewNav({ sid, current }: { sid: string; current: ViewId }) {
  return (
    <nav aria-label="Views" className="mt-4">
      <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {VIEWS.map((v) => (
          <li key={v.id} className="shrink-0">
            <Link
              href={viewHref(v.id, sid)}
              aria-current={v.id === current ? "page" : undefined}
              className={cn(
                "inline-flex whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
