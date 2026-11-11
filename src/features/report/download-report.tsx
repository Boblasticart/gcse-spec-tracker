"use client";

import { useState } from "react";

import { useSession } from "@/client/session";
import { useDocs, useEngine } from "@/client/sync/react";
import { londonToday } from "@/lib/dates";
import { buildReport, reportFileName } from "@/lib/tracker/report";
import { Button } from "@/ui/button";

/** "Download progress PDF": builds the report in the browser (so it works offline), loading the PDF code only when asked. */
export function DownloadReport() {
  const { user } = useSession();
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const download = async (): Promise<void> => {
    if (!user) return;
    setBusy(true);
    setErr("");
    try {
      const [{ pdf }, { ReportDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./report-pdf")]);
      const today = londonToday();
      const docs = Object.fromEntries(Object.entries(engine.store.getState().docs).map(([p, e]) => [p, e.data]));
      const blob = await pdf(<ReportDocument data={buildReport({ email: user.email, today, docs })} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(today);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setErr("Could not make the PDF. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => void download()} busy={busy} disabled={!ready}>
        {busy ? "Making your PDF..." : "Download progress PDF"}
      </Button>
      {err ? (
        <span role="alert" className="text-sm text-danger">
          {err}
        </span>
      ) : null}
    </div>
  );
}
