/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * The service worker (Serwist). It precaches the app shell (Next.js static
 * files), caches pages as they are visited, keeps the notes and question
 * bank for offline use, keeps practice paper PDFs once opened, and shows
 * /~offline for pages it has never seen. API calls are never cached: the
 * page keeps its own offline copy of the student's data in IndexedDB.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const ours: RuntimeCaching[] = [
  {
    // Account data and AI calls must always be live (and never stored by the worker).
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  {
    // Practice papers: once opened, they open offline too.
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/papers/") && url.pathname.endsWith(".pdf"),
    handler: new CacheFirst({
      cacheName: "papers",
      plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 180 * 24 * 60 * 60 })],
    }),
  },
  {
    // Prepared notes and the question bank.
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/data/") && url.pathname.endsWith(".json"),
    handler: new StaleWhileRevalidate({
      cacheName: "content",
      plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...ours, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
