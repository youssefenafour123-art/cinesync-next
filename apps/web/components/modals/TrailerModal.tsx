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
  const z = useModalBehavior(close);

  return (
    <motion.div
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Trailer"
    >
      <div className="absolute inset-0 bg-black/92 backdrop-blur-sm" onClick={close} />

      {/*
         Anchored to the overlay, not to the player.

         Sitting inside the frame put it on top of YouTube's own top-right
         controls — the quality and settings affordances the player draws over
         the video — so the two competed for the same corner and a click could
         land on either. Out here it is over the dimmed backdrop instead, well
         clear of every control the embed owns, and it no longer moves with the
         video's letterboxing.
      */}
      <button
        type="button"
        onClick={close}
        aria-label="Close trailer"
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-md transition-all duration-200 hover:border-primary/30 hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:right-6 md:top-6"
      >
        <Icon name="close" className="text-[20px]" />
      </button>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
      >
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
