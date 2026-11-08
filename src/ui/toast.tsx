"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "./cn";

export type ToastTone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

type ShowToast = (text: string, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TONE: Record<ToastTone, string> = {
  info: "border-line",
  success: "border-done/40",
  error: "border-danger/40",
};

/** Small messages in the corner that fade away after a few seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>(
    (text, tone = "info") => {
      const id = next.current++;
      setItems((all) => [...all.slice(-2), { id, text, tone }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              role={t.tone === "error" ? "alert" : "status"}
              data-testid="toast"
              className={cn(
                "pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm text-fg shadow-lift",
                TONE[t.tone],
              )}
            >
              <span className="flex-1">{t.text}</span>
              <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const t = useContext(ToastContext);
  if (!t) throw new Error("useToast must be used inside <ToastProvider>");
  return t;
}
