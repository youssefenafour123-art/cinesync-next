"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useModalBehavior } from "@/lib/useModalBehavior";
import { Icon } from "@/components/ui/Icon";

/**
 * Trailer player.
 *
 * The legacy `playTrailer()` looked for `#trailerIframe`, which didn't exist,
 * so it fell through to `window.open()` and the trailer opened in a new tab.
 * Unmounting this component destroys the iframe, which is what actually stops
 * the audio — the old code only blanked `src` in one of its two `closeTrailer`
 * definitions.
 */
export function TrailerModal() {
  const trailerKey = useAppStore((s) => s.trailerKey);
  const loading = useAppStore((s) => s.trailerLoading);
  const close = useAppStore((s) => s.closeTrailer);
  useModalBehavior(close);

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Trailer"
    >
      <div className="absolute inset-0 bg-black/92 backdrop-blur-sm" onClick={close} />

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close trailer"
          className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/15"
        >
          <Icon name="close" />
        </button>

        {loading || !trailerKey ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-on-surface-variant">
            <Icon name="progress_activity" className="animate-spin text-3xl text-primary" />
            <span className="font-label-md text-label-md">Finding a trailer…</span>
          </div>
        ) : (
          <iframe
            key={trailerKey}
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
            title="Trailer"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        )}
      </motion.div>
    </motion.div>
  );
}
