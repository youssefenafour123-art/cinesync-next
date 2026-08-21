"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "./Icon";

/** Bottom-centre notice. Replaces the legacy code's `alert()` calls. */
export function Toast() {
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 4000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-24 left-1/2 z-[400] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-surface-container-high/95 px-5 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-md md:bottom-8"
          role="status"
          aria-live="polite"
        >
          <Icon name="info" className="shrink-0 text-[20px] text-primary" />
          <span className="font-body-md text-[14px] text-on-surface">{toast}</span>
          <button
            type="button"
            onClick={clearToast}
            aria-label="Dismiss"
            className="shrink-0 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
