import type { ChangeResult, DocDto } from "@/lib/docs";

import { api } from "../api";
import type { DocsTransport } from "./engine";

/** The real transport: our /api/docs routes. */
export const httpTransport: DocsTransport = {
  list(since) {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    return api<{ docs: DocDto[]; cursor: string }>(`/api/docs${q}`);
  },
  put(changes) {
    return api<{ results: ChangeResult[] }>("/api/docs", { method: "PUT", body: { changes } });
  },
};
