import type { ReactNode } from "react";

import type { Subject } from "@/content";

import { SubjectNav } from "./subject-nav";
import { ViewNav } from "./view-nav";
import type { ViewId } from "./views";

/**
 * The tracker's frame: subject tabs, view chips, then the view itself.
 * In `reader` mode (notes and quizzes) the view chips are hidden, as in the legacy tracker.
 */
export function TrackerShell({ subject, view, reader = false, children }: { subject: Subject; view: ViewId; reader?: boolean; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <SubjectNav current={subject.id} view={view} />
      {reader ? null : <ViewNav sid={subject.id} current={view} />}
      <div className="mt-6">{children}</div>
    </main>
  );
}
