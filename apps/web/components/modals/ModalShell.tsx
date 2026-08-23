"use client";

import { motion } from "framer-motion";
import { useModalBehavior } from "@/lib/useModalBehavior";
import { Icon } from "@/components/ui/Icon";

interface ModalShellProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Extra classes for the panel itself. */
  className?: string;
  label: string;
}

/**
 * Shared backdrop + panel for every modal.
 *
 * Framer's AnimatePresence drives enter/exit, replacing the legacy approach of
 * toggling `.active` and `.hidden` on the same element from two different
 * script blocks — where `closeTrailer` was defined twice and the second
 * definition silently won.
 *
 * One constraint on where a modal may be rendered from: the z-index below is
 * only comparable within its own stacking context, and the tab shell in
 * `page.tsx` is `<main className="relative z-10">`. A modal rendered from
 * inside a tab is therefore ranked against `main` rather than against the navs
 * that sit outside it, and loses to both. Declare it at the top level of
 * `page.tsx` like the rest, or portal it out — `CalendarTab` does the latter,
 * because the day it shows is local state that doesn't belong in the store.
 */
export function ModalShell({ onClose, children, className = "", label }: ModalShellProps) {
  // Mount order, not DOM order, decides which modal is on top — see the hook.
  const z = useModalBehavior(onClose);

  return (
    <motion.div
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-center justify-center p-4 md:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden ${className}`}
      >
        {/*
           Sized as a square and centred with flex rather than padded around
           the glyph. `.material-symbols-outlined` is `display: inline-block`,
           so `p-2` around it measured a line box — the glyph's descender space
           made the button taller than it was wide, and `rounded-full` on a
           non-square box draws an oval, not a circle. Fixed 36px with the icon
           centred is the only way this stays round at every zoom level.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-on-surface-variant backdrop-blur-md transition-all duration-200 hover:border-primary/30 hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}
