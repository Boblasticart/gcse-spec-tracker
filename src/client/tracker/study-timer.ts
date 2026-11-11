"use client";

import { useEffect } from "react";

import { useDocs, useEngine } from "@/client/sync/react";
import { londonToday } from "@/lib/dates";
import { addStudySeconds, STATS_TIME_PATH } from "@/lib/tracker/metrics";

/** No keyboard, mouse, touch or scroll for this long counts as a break. */
const IDLE_MS = 2 * 60 * 1000;
const TICK_MS = 1000;
const SAVE_MS = 30 * 1000;

/**
 * Counts active study time on a question or quiz screen and adds it to the
 * `stats/time` doc. Time stops while the tab is hidden or the student has
 * been idle, and is saved every 30 seconds and when they leave the screen.
 */
export function useStudyTimer(enabled = true): void {
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");

  useEffect(() => {
    if (!enabled || !ready) return;
    let last = Date.now();
    let lastInput = last;
    let pendingMs = 0;

    const tick = (): void => {
      const now = Date.now();
      // Never count more than a few seconds per tick (timers pause in background tabs).
      if (document.visibilityState === "visible" && now - lastInput < IDLE_MS) pendingMs += Math.min(now - last, 5 * TICK_MS);
      last = now;
    };
    const save = (): void => {
      tick();
      const seconds = Math.floor(pendingMs / 1000);
      if (seconds <= 0) return;
      pendingMs -= seconds * 1000;
      engine.update(STATS_TIME_PATH, (doc) => addStudySeconds(doc, londonToday(), seconds));
    };
    const onInput = (): void => {
      lastInput = Date.now();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        // Count up to the moment the tab was hidden, then save.
        const now = Date.now();
        if (now - lastInput < IDLE_MS) pendingMs += Math.min(now - last, 5 * TICK_MS);
        last = now;
        const seconds = Math.floor(pendingMs / 1000);
        if (seconds > 0) {
          pendingMs -= seconds * 1000;
          engine.update(STATS_TIME_PATH, (doc) => addStudySeconds(doc, londonToday(), seconds));
        }
      } else {
        last = Date.now();
        lastInput = last;
      }
    };

    const events = ["keydown", "pointerdown", "pointermove", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const tickTimer = window.setInterval(tick, TICK_MS);
    const saveTimer = window.setInterval(save, SAVE_MS);
    return () => {
      for (const e of events) window.removeEventListener(e, onInput);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(tickTimer);
      window.clearInterval(saveTimer);
      save();
    };
  }, [enabled, ready, engine]);
}
