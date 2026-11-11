"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { memoryOutbox, type DocsSnapshot, type OutboxEntry, type OutboxStorage } from "./outbox";

/**
 * The outbox and the offline snapshot in IndexedDB, one record per account,
 * so changes made offline survive a reload and the app opens without a
 * connection. Falls back to memory where IndexedDB isn't available.
 */
interface SyncDb extends DBSchema {
  outbox: { key: string; value: { userId: string; entries: OutboxEntry[] } };
  snapshot: { key: string; value: { userId: string; snapshot: DocsSnapshot } };
}

const DB_NAME = "gst-sync";
let dbPromise: Promise<IDBPDatabase<SyncDb>> | null = null;

function db(): Promise<IDBPDatabase<SyncDb>> {
  dbPromise ??= openDB<SyncDb>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore("outbox", { keyPath: "userId" });
      d.createObjectStore("snapshot", { keyPath: "userId" });
    },
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

export function idbStorage(userId: string): OutboxStorage {
  if (typeof indexedDB === "undefined") return memoryOutbox();
  return {
    async load() {
      return (await (await db()).get("outbox", userId))?.entries ?? [];
    },
    async save(entries) {
      await (await db()).put("outbox", { userId, entries: structuredClone(entries) });
    },
    async loadSnapshot() {
      return (await (await db()).get("snapshot", userId))?.snapshot ?? null;
    },
    async saveSnapshot(snapshot) {
      await (await db()).put("snapshot", { userId, snapshot: structuredClone(snapshot) });
    },
    async clear() {
      const d = await db();
      await Promise.all([d.delete("outbox", userId), d.delete("snapshot", userId)]);
    },
  };
}
