import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/client/api";
import { SyncEngine, type DocsTransport } from "@/client/sync/engine";
import type { ChangeResult, DocChangeIn, DocDto } from "@/lib/docs";

/** An in-memory server with the same compare-and-set rules as PUT /api/docs. */
class FakeServer implements DocsTransport {
  docs = new Map<string, { data: unknown; version: number; deleted: boolean }>();
  puts: DocChangeIn[][] = [];
  offline = false;

  dto(path: string): DocDto | null {
    const d = this.docs.get(path);
    return d ? { path, data: d.deleted ? null : d.data, version: d.version, deleted: d.deleted, updatedAt: "" } : null;
  }

  async list(): Promise<ApiResult<{ docs: DocDto[]; cursor: string }>> {
    if (this.offline) return { ok: false, code: "NETWORK", message: "offline", status: 0 };
    const docs = [...this.docs.keys()].map((p) => this.dto(p)).filter((d): d is DocDto => !!d);
    return { ok: true, docs, cursor: "c" };
  }

  async put(changes: DocChangeIn[]): Promise<ApiResult<{ results: ChangeResult[] }>> {
    if (this.offline) return { ok: false, code: "NETWORK", message: "offline", status: 0 };
    this.puts.push(structuredClone(changes));
    const results: ChangeResult[] = changes.map((c) => {
      const cur = this.docs.get(c.path);
      if ((cur?.version ?? 0) !== c.baseVersion) return { path: c.path, status: "conflict", server: this.dto(c.path) };
      const version = (cur?.version ?? 0) + 1;
      this.docs.set(c.path, { data: c.data ?? {}, version, deleted: c.data === null });
      return { path: c.path, status: "ok", version, updatedAt: "" };
    });
    return { ok: true, results };
  }

  /** Another device saves directly. */
  external(path: string, data: unknown): void {
    const cur = this.docs.get(path);
    this.docs.set(path, { data, version: (cur?.version ?? 0) + 1, deleted: false });
  }
}

const manualTimers = () => {
  const pending: (() => void)[] = [];
  return {
    setTimer: (fn: () => void) => pending.push(fn),
    clearTimer: () => undefined,
    pending,
  };
};

const progress = (s: Record<string, number>) => ({ s, c: {}, m: {}, w: {}, v: 2 });

describe("sync engine", () => {
  it("hydrates, applies local edits at once, and saves them with the base version", async () => {
    const server = new FakeServer();
    server.external("progress/phy", progress({ a: 1 }));
    const timers = manualTimers();
    const engine = new SyncEngine(server, timers);
    await engine.hydrate();
    expect(engine.store.getState().phase).toBe("ready");
    expect(engine.get("progress/phy")).toEqual(progress({ a: 1 }));

    engine.update("progress/phy", (d) => ({ ...(d as object), s: { a: 2 } }));
    expect(engine.get("progress/phy")).toMatchObject({ s: { a: 2 } });
    expect(engine.store.getState().pending).toBe(1);
    expect(timers.pending).toHaveLength(1);

    await engine.flush();
    expect(server.puts[0]).toEqual([{ path: "progress/phy", data: { s: { a: 2 }, c: {}, m: {}, w: {}, v: 2 }, baseVersion: 1 }]);
    expect(server.docs.get("progress/phy")?.version).toBe(2);
    expect(engine.store.getState().pending).toBe(0);
    expect(engine.store.getState().docs["progress/phy"]?.version).toBe(2);
  });

  it("coalesces several edits to one doc into one save", async () => {
    const server = new FakeServer();
    const engine = new SyncEngine(server, manualTimers());
    await engine.hydrate();
    engine.update("a/q1", () => ({ text: "one" }));
    engine.update("a/q1", () => ({ text: "two" }));
    await engine.flush();
    expect(server.puts).toHaveLength(1);
    expect(server.puts[0]).toEqual([{ path: "a/q1", data: { text: "two" }, baseVersion: 0 }]);
  });

  it("merges progress key by key when another device saved first", async () => {
    const server = new FakeServer();
    server.external("progress/bio", progress({ x: 1 }));
    const engine = new SyncEngine(server, manualTimers());
    await engine.hydrate();
    server.external("progress/bio", progress({ x: 1, y: 2 })); // another device
    engine.update("progress/bio", (d) => ({ ...(d as object), s: { x: 2 } }));
    await engine.flush();
    expect(server.docs.get("progress/bio")?.data).toMatchObject({ s: { x: 2, y: 2 } });
    expect(engine.get("progress/bio")).toMatchObject({ s: { x: 2, y: 2 } });
    expect(engine.store.getState().pending).toBe(0);
  });

  it("is last-writer-wins for other docs", async () => {
    const server = new FakeServer();
    server.external("notes/p1", { text: "old" });
    const engine = new SyncEngine(server, manualTimers());
    await engine.hydrate();
    server.external("notes/p1", { text: "theirs" });
    engine.update("notes/p1", () => ({ text: "mine" }));
    await engine.flush();
    expect(server.docs.get("notes/p1")?.data).toEqual({ text: "mine" });
  });

  it("keeps changes queued while offline and retries", async () => {
    const server = new FakeServer();
    const timers = manualTimers();
    const engine = new SyncEngine(server, timers);
    await engine.hydrate();
    server.offline = true;
    engine.update("a/q2", () => ({ text: "x" }));
    await engine.flush();
    expect(engine.store.getState().lastError).toBe("offline");
    expect(engine.store.getState().pending).toBe(1);
    server.offline = false;
    await engine.flush();
    expect(server.docs.get("a/q2")?.data).toEqual({ text: "x" });
    expect(engine.store.getState().lastError).toBeNull();
  });

  it("deletes docs and picks up other devices' changes on pull", async () => {
    const server = new FakeServer();
    server.external("quiz/t1", { qs: [] });
    const engine = new SyncEngine(server, manualTimers());
    await engine.hydrate();
    engine.update("quiz/t1", () => null);
    expect(engine.get("quiz/t1")).toBeUndefined();
    await engine.flush();
    expect(server.docs.get("quiz/t1")?.deleted).toBe(true);

    server.external("progress/geo", progress({ g: 2 }));
    await engine.pull();
    expect(engine.get("progress/geo")).toEqual(progress({ g: 2 }));
  });

  it("forgets everything on reset", async () => {
    const server = new FakeServer();
    server.external("progress/phy", progress({ a: 1 }));
    const engine = new SyncEngine(server, manualTimers());
    await engine.hydrate();
    engine.update("a/q", () => ({}));
    engine.reset();
    expect(engine.store.getState()).toMatchObject({ phase: "idle", docs: {}, pending: 0 });
  });
});
