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

/** Where the outbox lives between page loads. In memory for now; IndexedDB in M9. */
export interface OutboxStorage {
  load(): Promise<OutboxEntry[]>;
  save(entries: OutboxEntry[]): Promise<void>;
}

export function memoryOutbox(): OutboxStorage {
  let saved: OutboxEntry[] = [];
  return {
    async load() {
      return structuredClone(saved);
    },
    async save(entries) {
      saved = structuredClone(entries);
    },
  };
}
