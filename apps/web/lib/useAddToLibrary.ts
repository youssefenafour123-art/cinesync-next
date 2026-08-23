"use client";

import { useCallback, useState } from "react";
import { addToLibrary } from "./stremio";
import { stremioAccounts, useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import type { MediaItem } from "./types";

/**
 * "Add to Library" for a browsed title.
 *
 * The legacy hero button was literally `onclick="alert('Added to Watchlist')"`
 * (index.html:4460) and the details-modal version posted to `/api/datastorePut`,
 * a path the server never routed. This writes through the working proxy to
 * every connected account.
 */
export function useAddToLibrary() {
  const [pending, setPending] = useState(false);
  const sources = useSourcesStore((s) => s.sources);
  const showToast = useAppStore((s) => s.showToast);
  const markInLibrary = useAppStore((s) => s.markInLibrary);
  const setAddSourceOpen = useAppStore((s) => s.setAddSourceOpen);

  const add = useCallback(
    async (item: MediaItem | null | undefined) => {
      if (!item || pending) return;

      const accounts = stremioAccounts(sources);
      if (accounts.length === 0) {
        showToast("Connect a Stremio account first.");
        setAddSourceOpen(true);
        return;
      }

      setPending(true);
      try {
        const { ok, failed } = await addToLibrary(
          item,
          accounts.map((a) => a.authKey),
        );

        if (ok > 0) {
          if (item.imdbId) markInLibrary(item.imdbId);
          showToast(
            failed > 0
              ? `Added to ${ok} of ${ok + failed} accounts.`
              : `Added “${item.title}” to your library.`,
          );
        } else {
          showToast("Stremio rejected the request. Try reconnecting your account.");
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Couldn't add to library.");
      } finally {
        setPending(false);
      }
    },
    [pending, sources, showToast, markInLibrary, setAddSourceOpen],
  );

  return { add, pending };
}
