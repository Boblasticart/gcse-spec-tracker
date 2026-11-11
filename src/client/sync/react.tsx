"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { useSession } from "../session";
import { SyncEngine } from "./engine";
import { idbStorage } from "./idb-storage";
import type { DocsState } from "./store";
import { httpTransport } from "./transport";

const EngineContext = createContext<SyncEngine | null>(null);

/** Loads the student's docs on sign-in, keeps them saved, and clears them on sign-out. */
export function DocsProvider({ children, engine: injected }: { children: ReactNode; engine?: SyncEngine }) {
  const [engine] = useState(() => injected ?? new SyncEngine(httpTransport));
  const { user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      engine.reset();
      return;
    }
    engine.setOnline(navigator.onLine);
    engine.attachStorage(idbStorage(userId));
    void engine.hydrate();
    const onOnline = (): void => engine.setOnline(true);
    const onOffline = (): void => engine.setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const onFocus = (): void => {
      if (document.visibilityState === "visible") void engine.pull();
    };
    const onHide = (): void => {
      if (document.visibilityState === "hidden") void engine.flush();
    };
    document.addEventListener("visibilitychange", onFocus);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void engine.flush();
    };
  }, [engine, userId]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): SyncEngine {
  const e = useContext(EngineContext);
  if (!e) throw new Error("useEngine must be used inside <DocsProvider>");
  return e;
}

export function useDocs<T>(selector: (s: DocsState) => T): T {
  return useStore(useEngine().store, selector);
}

/** The current data of one doc (undefined until loaded or if it doesn't exist). */
export function useDoc(path: string): unknown {
  return useDocs((s) => s.docs[path]?.data);
}

export type SyncSummary = "off" | "loading" | "saving" | "saved" | "offline" | "error";

export function useSyncSummary(): { summary: SyncSummary; pending: number; message: string | null } {
  const phase = useDocs((s) => s.phase);
  const pending = useDocs((s) => s.pending);
  const saving = useDocs((s) => s.saving);
  const lastError = useDocs((s) => s.lastError);
  const online = useDocs((s) => s.online);
  let summary: SyncSummary = "off";
  if (!online && phase !== "idle") summary = "offline";
  else if (phase === "loading") summary = "loading";
  else if (phase === "error" || lastError) summary = "error";
  else if (phase === "ready") summary = saving || pending ? "saving" : "saved";
  return { summary, pending, message: lastError };
}
