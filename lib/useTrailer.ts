"use client";

import { useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { MediaItem } from "./types";

/**
 * Opens the trailer modal for an item.
 *
 * Resolution order: the TMDB trailer key we already enriched with, then a
 * Cinemeta meta lookup by IMDb id. If neither yields anything we say so
 * instead of playing something unrelated — the legacy code silently fell back
 * to a hardcoded Rickroll video ID (index.html:4558).
 */
export function useTrailer() {
  const openTrailer = useAppStore((s) => s.openTrailer);
  const setTrailerLoading = useAppStore((s) => s.setTrailerLoading);
  const closeTrailer = useAppStore((s) => s.closeTrailer);
  const showToast = useAppStore((s) => s.showToast);

  const play = useCallback(
    async (item: MediaItem | null | undefined) => {
      if (!item) return;

      if (item.trailerKey) {
        openTrailer(item.trailerKey);
        return;
      }

      if (!item.imdbId) {
        showToast(`No trailer available for ${item.title}.`);
        return;
      }

      setTrailerLoading(true);
      try {
        const res = await fetch(`/api/meta/${item.kind}/${item.imdbId}`);
        const meta = res.ok ? ((await res.json()) as MediaItem) : null;
        if (meta?.trailerKey) {
          openTrailer(meta.trailerKey);
        } else {
          closeTrailer();
          showToast(`No trailer available for ${item.title}.`);
        }
      } catch {
        closeTrailer();
        showToast("Couldn't load the trailer. Check your connection.");
      }
    },
    [openTrailer, setTrailerLoading, closeTrailer, showToast],
  );

  /** Play a known YouTube key directly. */
  const playKey = useCallback((key: string) => openTrailer(key), [openTrailer]);

  return { play, playKey };
}
