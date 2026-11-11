"use client";

import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * View state the legacy tracker kept in memory while you moved around: the
 * spec filter, which topics are open, and where "Back" returns to from the
 * notes reader. It survives moving between pages but not a reload, exactly
 * like the legacy tracker. Nothing here is saved to the account.
 */

export type SpecFilter = "all" | "0" | "1" | "2";
export const SPEC_FILTERS: readonly { id: SpecFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "0", label: "Not done" },
  { id: "1", label: "Needs work" },
  { id: "2", label: "Done" },
];

export interface BackTarget {
  /** Where "Back" goes, e.g. `/spec/phy`. */
  href: string;
  /** Which view that is, for the button label. */
  view: "spec" | "improve";
  /** Scroll position to return to. */
  y: number;
}

export interface UiState {
  filter: SpecFilter;
  /** Open topic ids (legacy `open`). */
  open: string[];
  /** Legacy `expandAll`: the Expand all / Collapse all button state. */
  expandAll: boolean;
  back: BackTarget | null;
}

const initial: UiState = { filter: "all", open: [], expandAll: false, back: null };

/** Lives as long as the page does (like the legacy in-memory state), so a reload starts fresh. */
export const uiStore = createStore<UiState>()(() => ({ ...initial }));

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

export const uiActions = {
  setFilter(filter: SpecFilter): void {
    uiStore.setState({ filter });
  },
  toggleTopic(id: string): void {
    const open = uiStore.getState().open;
    uiStore.setState({ open: open.includes(id) ? open.filter((x) => x !== id) : [...open, id] });
  },
  /** Legacy `exp`: open every topic of the subject, or close them all. */
  expandAll(expand: boolean, topicIds: readonly string[]): void {
    uiStore.setState({ expandAll: expand, open: expand ? [...topicIds] : [] });
  },
  /** Remembers where the notes reader's Back button returns to (legacy `backView`/`backY`). */
  rememberBack(view: BackTarget["view"], href: string): void {
    uiStore.setState({ back: { view, href, y: window.scrollY } });
  },
};

/** A scroll position to apply once the view we went back to has rendered. */
let pendingScroll: number | null = null;

export function requestScrollRestore(y: number): void {
  pendingScroll = y;
}

export function takePendingScroll(): number | null {
  const y = pendingScroll;
  pendingScroll = null;
  return y;
}

/** Call in a view that "Back" can return to: restores the remembered scroll position once. */
export function useRestoreScroll(): void {
  useEffect(() => {
    const y = takePendingScroll();
    if (y === null) return;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);
}
