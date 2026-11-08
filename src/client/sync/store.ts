import { createStore, type StoreApi } from "zustand/vanilla";

export interface DocEntry {
  data: unknown;
  /** Last version confirmed by the server (0 = never saved). */
  version: number;
}

export type SyncPhase = "idle" | "loading" | "ready" | "error";

export interface DocsState {
  phase: SyncPhase;
  /** What the UI shows: the server copy with this device's unsaved changes on top. */
  docs: Record<string, DocEntry>;
  /** Changes waiting to be saved. */
  pending: number;
  saving: boolean;
  /** Plain-English problem with the last save or load, if any. */
  lastError: string | null;
}

export const initialDocsState = (): DocsState => ({
  phase: "idle",
  docs: {},
  pending: 0,
  saving: false,
  lastError: null,
});

export type DocsStore = StoreApi<DocsState>;

export function createDocsStore(): DocsStore {
  return createStore<DocsState>()(() => initialDocsState());
}
