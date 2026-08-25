"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "./types";
import { useSession } from "./useSession";
import { useAppStore } from "@/store/useAppStore";
import { addToList, fetchListItems, fetchWatchlistId, removeFromList, toSavedTitle } from "./lists";

/**
 * The signed-in user's watchlist, held once for the whole app.
 *
 * Module scope rather than per-component state, for the same reason
 * `useLibrarySync` keeps its throttle there: the details modal, the Library
 * tab and every poster badge all ask the same question, and each of them
 * fetching its own copy would mean a card's badge could disagree with the
 * modal opened from it.
 */
let watchlistId: string | null = null;
let saved = new Set<string>();
let loaded = false;
let inFlight: Promise<void> | null = null;

const subscribers = new Set<() => void>();
function publish() {
  for (const fn of subscribers) fn();
}

async function load(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const id = await fetchWatchlistId();
      watchlistId = id;
      saved = new Set(id ? (await fetchListItems(id)).map((t) => t.imdbId) : []);
      loaded = true;
      publish();
    } catch {
      // A watchlist that cannot be read leaves every badge off, which is the
      // safe way to be wrong: nothing claims to be saved that might not be.
      loaded = true;
      publish();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Forget everything — a different account has a different watchlist. */
export function resetWatchlist(): void {
  watchlistId = null;
  saved = new Set();
  loaded = false;
  publish();
}

export function useWatchlist() {
  const { user } = useSession();
  const showToast = useAppStore((s) => s.showToast);
  const [, force] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      resetWatchlist();
      return;
    }
    if (!loaded) void load();
  }, [user]);

  const has = useCallback((imdbId?: string) => Boolean(imdbId && saved.has(imdbId)), []);

  const toggle = useCallback(
    async (item: MediaItem) => {
      if (!user) {
        showToast("Sign in to keep a watchlist.");
        return;
      }
      if (!watchlistId) {
        showToast("Couldn't find your watchlist. Try reloading.");
        return;
      }

      let title;
      try {
        title = toSavedTitle(item);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "This title can't be saved.");
        return;
      }

      const adding = !saved.has(title.imdbId);
      setPending(true);

      /*
         Optimistic, and rolled back on failure.

         `useLibraryActions` updates only after a successful write, because
         each of its writes goes to somebody else's server and a partial
         success across several accounts is meaningful. This is one row in one
         database, so the honest choice is the responsive one — but it does
         mean putting the badge back if the write is refused, which that older
         path never had to do.
      */
      const next = new Set(saved);
      if (adding) next.add(title.imdbId);
      else next.delete(title.imdbId);
      saved = next;
      publish();

      try {
        if (adding) await addToList(watchlistId, title);
        else await removeFromList(watchlistId, title.imdbId);
      } catch (err) {
        const revert = new Set(saved);
        if (adding) revert.delete(title.imdbId);
        else revert.add(title.imdbId);
        saved = revert;
        publish();
        showToast(err instanceof Error ? err.message : "That didn't save.");
      } finally {
        setPending(false);
      }
    },
    [user, showToast],
  );

  return { has, toggle, pending, ready: loaded, signedIn: Boolean(user) };
}
