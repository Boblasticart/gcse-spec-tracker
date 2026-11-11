"use client";

import { useDocs, useEngine } from "@/client/sync/react";
import { withMastered, withMorePractice } from "@/client/tracker/progress";
import { londonToday } from "@/lib/dates";

/** Legacy `master` / `more` buttons for a point that has had three correct in a row. */
export function DecisionButtons({ sid, pid, label }: { sid: string; pid: string; label: string }) {
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const path = `progress/${sid}`;
  return (
    <div role="group" aria-label={`Decide on ${label}`} className="inline-flex shrink-0 gap-1 text-xs font-semibold">
      <button
        type="button"
        disabled={!ready}
        className="rounded-md bg-done px-2.5 py-1.5 text-on-fill transition active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100"
        onClick={() => engine.update(path, (doc) => withMastered(doc, pid))}
      >
        Mastered
      </button>
      <button
        type="button"
        disabled={!ready}
        className="rounded-md bg-work px-2.5 py-1.5 text-on-fill transition active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100"
        onClick={() => engine.update(path, (doc) => withMorePractice(doc, pid, londonToday()))}
      >
        More practice
      </button>
    </div>
  );
}
