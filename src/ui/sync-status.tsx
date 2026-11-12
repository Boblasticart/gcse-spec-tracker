"use client";

import { useSession } from "@/client/session";
import { useSyncSummary } from "@/client/sync/react";

import { cn } from "./cn";

const TEXT = {
  off: "",
  loading: "Loading your progress…",
  saving: "Syncing…",
  saved: "Saved",
  offline: "Offline",
  error: "Not saved yet",
} as const;

/** "Saved" / "Syncing…" / "Offline: 3 changes waiting" next to the account menu. */
export function SyncStatus() {
  const { user } = useSession();
  const { summary, message, pending } = useSyncSummary();
  if (!user || summary === "off") return null;
  return (
    <span
      role="status"
      data-testid="sync-status"
      data-state={summary}
      title={summary === "error" ? (message ?? undefined) : undefined}
      className={cn(
        "inline-flex max-w-40 items-center gap-1.5 truncate text-xs sm:max-w-none",
        summary === "error" || summary === "offline" ? "text-work" : "text-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          summary === "saved" && "bg-done",
          summary === "saving" && "animate-pulse bg-accent motion-reduce:animate-none",
          summary === "loading" && "animate-pulse bg-muted motion-reduce:animate-none",
          (summary === "error" || summary === "offline") && "bg-work",
        )}
      />
      {summary === "offline"
        ? pending
          ? `Offline: ${pending} change${pending === 1 ? "" : "s"} waiting`
          : "Offline: changes will sync"
        : TEXT[summary]}
    </span>
  );
}
