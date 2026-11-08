"use client";

import { useSignInPrompt } from "@/client/sign-in-prompt";
import { useSession } from "@/client/session";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { STATUS_LABELS, statusOf, withStatus, type PointStatus } from "@/client/tracker/progress";
import { cn } from "@/ui/cn";

const TONES = [
  "aria-pressed:bg-stone-700 aria-pressed:text-white dark:aria-pressed:bg-stone-200 dark:aria-pressed:text-stone-900",
  "aria-pressed:bg-amber-500 aria-pressed:text-white",
  "aria-pressed:bg-emerald-600 aria-pressed:text-white",
];

/** The legacy 3-way status control (Not done / Needs work / Done) for one spec point. */
export function PointStatusControl({ sid, pid, label }: { sid: string; pid: string; label: string }) {
  const { user } = useSession();
  const prompt = useSignInPrompt();
  const engine = useEngine();
  const path = `progress/${sid}`;
  const progress = useDoc(path);
  const ready = useDocs((s) => s.phase === "ready");
  const current = user ? statusOf(progress, pid) : null;

  const choose = (status: PointStatus): void => {
    if (!user) {
      prompt("to track your progress");
      return;
    }
    engine.update(path, (doc) => withStatus(doc, pid, status));
  };

  return (
    <div role="group" aria-label={`Status of ${label}`} className="inline-flex shrink-0 overflow-hidden rounded-lg border border-stone-300 text-xs font-semibold dark:border-stone-700">
      {STATUS_LABELS.map((text, i) => (
        <button
          key={text}
          type="button"
          aria-pressed={current === i}
          disabled={!!user && !ready}
          onClick={() => choose(i as PointStatus)}
          className={cn(
            "px-2.5 py-1.5 transition-colors hover:bg-stone-100 disabled:opacity-50 motion-reduce:transition-none dark:hover:bg-stone-800",
            i > 0 && "border-l border-stone-300 dark:border-stone-700",
            TONES[i],
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
