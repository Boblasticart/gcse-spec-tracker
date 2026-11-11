/** A local change waiting to reach the server. One entry per doc path. */
export interface OutboxEntry {
  path: string;
  /** The server copy this change was made on top of. */
  base: { version: number; data: unknown };
  /** This device's latest copy; `null` deletes the doc. */
  local: unknown;
  /** Bumped on every local edit, so an in-flight save can tell if it is stale. */
  rev: number;
}

/** The last server copy of every doc, kept so the app opens (and works) offline. */
export interface DocsSnapshot {
  docs: [path: string, entry: { data: unknown; version: number }][];
  cursor: string | undefined;
}

/** Where the outbox (and the offline snapshot) live between page loads: memory, or IndexedDB in the browser. */
export interface OutboxStorage {
  load(): Promise<OutboxEntry[]>;
  save(entries: OutboxEntry[]): Promise<void>;
  loadSnapshot?(): Promise<DocsSnapshot | null>;
  saveSnapshot?(snapshot: DocsSnapshot): Promise<void>;
  /** Forgets everything for this account on this device (sign-out). */
  clear?(): Promise<void>;
}

export function memoryOutbox(): OutboxStorage {
  let saved: OutboxEntry[] = [];
  let snapshot: DocsSnapshot | null = null;
  return {
    async load() {
      return structuredClone(saved);
    },
    async save(entries) {
      saved = structuredClone(entries);
    },
    async loadSnapshot() {
      return structuredClone(snapshot);
    },
    async saveSnapshot(s) {
      snapshot = structuredClone(s);
    },
    async clear() {
      saved = [];
      snapshot = null;
    },
  };
}
