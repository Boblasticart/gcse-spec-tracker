"use client";

import { useSession } from "@/client/session";
import { useSyncSummary } from "@/client/sync/react";

import { cn } from "./cn";

const TEXT = {
  off: "",
  loading: "Loading your progress…",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved yet",
} as const;

/** "Saved" / "Saving…" next to the account menu. */
export function SyncStatus() {
  const { user } = useSession();
  const { summary, message } = useSyncSummary();
  if (!user || summary === "off") return null;
  return (
    <span
      role="status"
      data-testid="sync-status"
      data-state={summary}
      title={summary === "error" ? (message ?? undefined) : undefined}
      className={cn(
        "hidden items-center gap-1.5 text-xs sm:inline-flex",
        summary === "error" ? "text-amber-700 dark:text-amber-400" : "text-stone-500",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          summary === "saved" && "bg-emerald-500",
          summary === "saving" && "animate-pulse bg-indigo-500 motion-reduce:animate-none",
          summary === "loading" && "animate-pulse bg-stone-400 motion-reduce:animate-none",
          summary === "error" && "bg-amber-500",
        )}
      />
      {TEXT[summary]}
    </span>
  );
}
