"use client";

/** Last-resort error page when the whole layout fails. Plain HTML: the app's styles may not have loaded. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "64px auto", padding: "0 16px", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Sorry, the tracker hit a problem. Anything you ticked is kept on this device and will be saved.</p>
        <button type="button" onClick={reset} style={{ padding: "10px 16px", marginTop: 16 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
