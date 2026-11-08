import { MAX_BATCH, type ChangeResult, type DocChangeIn, type DocDto } from "@/lib/docs";

import type { ApiResult } from "../api";
import { resolveConflict } from "./merge";
import { memoryOutbox, type OutboxEntry, type OutboxStorage } from "./outbox";
import { createDocsStore, initialDocsState, type DocEntry, type DocsStore } from "./store";

export interface DocsTransport {
  list(since?: string): Promise<ApiResult<{ docs: DocDto[]; cursor: string }>>;
  put(changes: DocChangeIn[]): Promise<ApiResult<{ results: ChangeResult[] }>>;
}

export interface EngineOptions {
  storage?: OutboxStorage;
  debounceMs?: number;
  /** Delay before retrying after a failed save. */
  retryMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Rounds of conflict resolution per flush before giving up until the next change. */
const MAX_ROUNDS = 5;

/**
 * Keeps the docs store in step with the server: optimistic local edits go
 * into an outbox and are saved in batches with each doc's base version; on a
 * conflict the server copy is merged (progress) or overwritten (other docs).
 */
export class SyncEngine {
  readonly store: DocsStore;
  private readonly transport: DocsTransport;
  private readonly storage: OutboxStorage;
  private readonly debounceMs: number;
  private readonly retryMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly outbox = new Map<string, OutboxEntry>();
  private readonly confirmed = new Map<string, DocEntry>();
  private cursor: string | undefined;
  private timer: unknown;
  private flushing: Promise<void> | null = null;
  private rev = 0;
  private generation = 0;

  constructor(transport: DocsTransport, options: EngineOptions = {}) {
    this.transport = transport;
    this.store = createDocsStore();
    this.storage = options.storage ?? memoryOutbox();
    this.debounceMs = options.debounceMs ?? 400;
    this.retryMs = options.retryMs ?? 5000;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Loads every doc for the signed-in student, then replays any unsaved changes. */
  async hydrate(): Promise<void> {
    const gen = this.generation;
    this.store.setState({ phase: "loading", lastError: null });
    for (const e of await this.storage.load()) this.outbox.set(e.path, e);
    const res = await this.transport.list();
    if (gen !== this.generation) return;
    if (!res.ok) {
      this.store.setState({ phase: "error", lastError: res.message });
      return;
    }
    this.confirmed.clear();
    for (const d of res.docs) if (!d.deleted) this.confirmed.set(d.path, { data: d.data, version: d.version });
    this.cursor = res.cursor;
    this.publish("ready");
    if (this.outbox.size) void this.flush();
  }

  /** Fetches only what changed on the server since the last load (e.g. edits from another device). */
  async pull(): Promise<void> {
    if (this.store.getState().phase !== "ready" || !this.cursor) return;
    const gen = this.generation;
    const res = await this.transport.list(this.cursor);
    if (gen !== this.generation || !res.ok) return;
    for (const d of res.docs) {
      const known = this.confirmed.get(d.path);
      if (known && known.version >= d.version) continue;
      if (d.deleted) this.confirmed.delete(d.path);
      else this.confirmed.set(d.path, { data: d.data, version: d.version });
    }
    this.cursor = res.cursor;
    this.publish();
  }

  get(path: string): unknown {
    return this.store.getState().docs[path]?.data;
  }

  /** Changes a doc locally (the UI updates at once) and queues it for saving. Return `null` to delete. */
  update(path: string, change: (current: unknown) => unknown): void {
    const current = this.get(path);
    const next = change(current === undefined ? undefined : structuredClone(current));
    const existing = this.outbox.get(path);
    const confirmed = this.confirmed.get(path);
    this.outbox.set(path, {
      path,
      base: existing ? existing.base : { version: confirmed?.version ?? 0, data: confirmed?.data },
      local: next ?? null,
      rev: ++this.rev,
    });
    void this.storage.save([...this.outbox.values()]);
    this.publish();
    this.schedule(this.debounceMs);
  }

  /** Sends queued changes now. Safe to call at any time. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.cancelTimer();
    this.flushing = this.runFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  /** Forgets everything (sign-out). */
  reset(): void {
    this.generation++;
    this.cancelTimer();
    this.outbox.clear();
    this.confirmed.clear();
    this.cursor = undefined;
    void this.storage.save([]);
    this.store.setState(initialDocsState());
  }

  private async runFlush(): Promise<void> {
    const gen = this.generation;
    for (let round = 0; round < MAX_ROUNDS && this.outbox.size; round++) {
      const batch = [...this.outbox.values()].slice(0, MAX_BATCH).map((e) => ({ ...e }));
      this.store.setState({ saving: true });
      const res = await this.transport.put(
        batch.map((e) => ({ path: e.path, data: e.local, baseVersion: e.base.version })),
      );
      if (gen !== this.generation) return;
      if (!res.ok) {
        this.store.setState({ saving: false, lastError: res.message });
        this.schedule(this.retryMs);
        return;
      }
      let conflicts = 0;
      for (const r of res.results) {
        const sent = batch.find((e) => e.path === r.path);
        const entry = this.outbox.get(r.path);
        if (!sent || !entry) continue;
        if (r.status === "ok") {
          if (sent.local === null) this.confirmed.delete(r.path);
          else this.confirmed.set(r.path, { data: sent.local, version: r.version });
          if (entry.rev === sent.rev) this.outbox.delete(r.path);
          else entry.base = { version: r.version, data: sent.local };
        } else {
          conflicts++;
          const server = r.server && !r.server.deleted ? r.server : null;
          if (server) this.confirmed.set(r.path, { data: server.data, version: server.version });
          else this.confirmed.delete(r.path);
          entry.local = resolveConflict(r.path, entry.base.data, entry.local, server?.data ?? null) ?? null;
          entry.base = { version: r.server?.version ?? 0, data: server?.data };
          entry.rev = ++this.rev;
        }
      }
      void this.storage.save([...this.outbox.values()]);
      this.store.setState({ lastError: null });
      this.publish();
      const truncated = batch.length === MAX_BATCH && this.outbox.size > 0;
      if (!conflicts && !truncated) break;
    }
    this.store.setState({ saving: false });
    this.publish();
    // Edits made while this save was in flight (or stubborn conflicts) go in the next one.
    if (this.outbox.size) this.schedule(this.debounceMs);
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  /** Recomputes what the UI sees: confirmed server copies with unsaved local changes on top. */
  private publish(phase?: "ready"): void {
    const docs: Record<string, DocEntry> = {};
    for (const [path, entry] of this.confirmed) docs[path] = entry;
    for (const [path, e] of this.outbox) {
      if (e.local === null) delete docs[path];
      else docs[path] = { data: e.local, version: this.confirmed.get(path)?.version ?? 0 };
    }
    this.store.setState({ docs, pending: this.outbox.size, ...(phase ? { phase } : {}) });
  }
}
