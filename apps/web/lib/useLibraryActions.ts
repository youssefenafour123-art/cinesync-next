"use client";

import { useCallback, useState } from "react";
import { addToLibrary, removeFromLibrary } from "./stremio";
import { stremioAccounts, useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import type { MediaItem, MediaKind } from "./types";

/**
 * What removal actually needs. Deliberately looser than `MediaItem` so the
 * Library tab can remove a title it only holds a history entry for — id,
 * title and kind — without inventing the rest of a media item to do it.
 */
export interface LibraryTarget {
  imdbId?: string;
  title: string;
  kind: MediaKind;
  poster?: string;
}

/**
 * Add and remove, for a browsed title, across every connected account.
 *
 * The legacy hero button was literally `onclick="alert('Added to Watchlist')"`
 * (index.html:4460) and the details-modal version posted to `/api/datastorePut`,
 * a path the server never routed. Both go through `lib/stremio.ts` now.
 *
 * One `pending` flag covers both actions because they share a button: the
 * control that removes a title is the one the added state turns into, so the
 * two can never be in flight at once.
 */
export function useLibraryActions() {
  const [pending, setPending] = useState<"add" | "remove" | null>(null);
  const sources = useSourcesStore((s) => s.sources);
  const showToast = useAppStore((s) => s.showToast);
  const markInLibrary = useAppStore((s) => s.markInLibrary);
  const unmarkInLibrary = useAppStore((s) => s.unmarkInLibrary);
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

      setPending("add");
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
        setPending(null);
      }
    },
    [pending, sources, showToast, markInLibrary, setAddSourceOpen],
  );

  const remove = useCallback(
    async (item: LibraryTarget | null | undefined) => {
      if (!item || pending) return;

      const accounts = stremioAccounts(sources);
      if (accounts.length === 0) {
        showToast("Connect a Stremio account first.");
        return;
      }

      setPending("remove");
      try {
        const { ok, failed } = await removeFromLibrary(
          item,
          accounts.map((a) => a.authKey),
        );

        if (ok > 0) {
          // Optimistic on purpose: the badge clearing is the only confirmation
          // the removal landed, and re-reading the library to prove it would
          // cost a round trip per click.
          if (item.imdbId) unmarkInLibrary(item.imdbId);
          showToast(
            failed > 0
              ? `Removed from ${ok} of ${ok + failed} accounts.`
              : `Removed “${item.title}” from your library.`,
          );
        } else {
          showToast("Stremio rejected the request. Try reconnecting your account.");
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Couldn't remove from library.");
      } finally {
        setPending(null);
      }
    },
    [pending, sources, showToast, unmarkInLibrary],
  );

  return { add, remove, pending, adding: pending === "add", removing: pending === "remove" };
}
