"use client";

import { useRef, useState } from "react";

import { api } from "@/client/api";
import { useEngine } from "@/client/sync/react";
import { EXPORT_FORMAT } from "@/lib/docs";
import { Button, buttonClass } from "@/ui/button";
import { cardClass } from "@/ui/card";
import { FormAlert } from "@/ui/field";

import { splitExport } from "./split";

/** Download a backup, or bring in the export file from the old GitHub Pages tracker. */
export function BackupPanel() {
  const engine = useEngine();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const importFile = async (file: File): Promise<void> => {
    setBusy(true);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || (parsed as { format?: unknown }).format !== EXPORT_FORMAT) {
      setResult({ tone: "error", text: "That is not a tracker export file." });
      setBusy(false);
      return;
    }
    let imported = 0;
    for (const part of splitExport(parsed as Parameters<typeof splitExport>[0])) {
      await engine.flush();
      const res = await api<{ imported: number; skipped: number }>("/api/docs/import", { body: part });
      if (!res.ok) {
        setResult({ tone: "error", text: res.message });
        setBusy(false);
        return;
      }
      imported += res.imported;
    }
    await engine.hydrate();
    setResult({ tone: "info", text: `Imported ${imported} saved item${imported === 1 ? "" : "s"}.` });
    setBusy(false);
  };

  return (
    <section aria-labelledby="backup-title" className={cardClass(false, "p-5")}>
      <h2 id="backup-title" className="font-heading text-lg font-semibold">
        Backup and import
      </h2>
      <p className="mt-1 text-sm text-muted">
        Moving from the old tracker? Use its <strong>Back up</strong> button, then import that file here. Items with the
        same name are replaced.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/api/docs/export" download className={buttonClass("secondary")}>
          Download a backup
        </a>
        <Button variant="secondary" busy={busy} onClick={() => input.current?.click()}>
          Import a file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Choose an export file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importFile(f);
          }}
        />
      </div>
      {result && (
        <div className="mt-4">
          <FormAlert tone={result.tone}>{result.text}</FormAlert>
        </div>
      )}
    </section>
  );
}
