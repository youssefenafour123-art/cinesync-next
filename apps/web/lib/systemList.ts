"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "./types";
import { useSession } from "./useSession";
import { useAppStore } from "@/store/useAppStore";
import type { SavedTitle, SystemListColumn } from "./lists";
import { addToList, fetchListItems, fetchSystemListId, removeFromList, toSavedTitle } from "./lists";

/**
 * A list the database creates for you and the app treats as a single answer.
 *
 * There are two — the watchlist and the watched list — and they are the same
 * mechanism twice: one `lists` row per account, flagged by a boolean column,
 * created by the signup trigger, and toggled by one press on a title rather
 * than chosen from a menu. Everything below was `useWatchlist` verbatim; it
 * became a factory when the second one arrived rather than a second copy,
 * because the copy would have been a hundred lines that had to be kept
 * identical by hand.
 *
 * Each store is its own module-level state, for the reason the singular one
 * had: the details modal, the profile and every poster badge ask the same
 * question, and a per-component copy would let a badge disagree with the
 * modal opened from it.
 */
export interface SystemListStore {
  /** The hook every consumer uses. Named for its shape, aliased at each export. */
  use: () => {
    items: SavedTitle[];
    has: (imdbId?: string) => boolean;
    toggle: (item: MediaItem) => Promise<void>;
    pending: boolean;
    ready: boolean;
    signedIn: boolean;
  };
  /** Forget everything — a different account has a different list. */
  reset: () => void;
}

interface Copy {
  /** Shown when someone signed out presses the button. */
  signedOut: string;
  /** Shown when the account has no such list, which the trigger should prevent. */
  missing: string;
}

export function createSystemListStore(column: SystemListColumn, copy: Copy): SystemListStore {
  let listId: string | null = null;
  /*
     The same list twice, on purpose. The sections render `items` in order;
     every poster badge in the app asks `saved` whether one id is in there. A
     `some()` over the array would turn a shelf of forty posters into forty
     linear scans, and rebuilding the set inside `has()` would allocate on every
     render — so they are built together and only ever written by `setItems`.
  */
  let items: SavedTitle[] = [];
  let saved = new Set<string>();
  let loaded = false;
  let inFlight: Promise<void> | null = null;

  const subscribers = new Set<() => void>();
  function publish() {
    for (const fn of subscribers) fn();
  }

  /** The only thing that writes the list. Keeps the two views of it in step. */
  function setItems(next: SavedTitle[]): void {
    items = next;
    saved = new Set(next.map((t) => t.imdbId));
  }

  async function load(userId: string): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const id = await fetchSystemListId(userId, column);
        listId = id;
        setItems(id ? await fetchListItems(id) : []);
        loaded = true;
        publish();
      } catch {
        // A list that cannot be read leaves every badge off, which is the safe
        // way to be wrong: nothing claims to be saved that might not be.
        loaded = true;
        publish();
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function reset(): void {
    listId = null;
    setItems([]);
    loaded = false;
    publish();
  }

  function use() {
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
        reset();
        return;
      }
      if (!loaded) void load(user.id);
    }, [user]);

    const has = useCallback((imdbId?: string) => Boolean(imdbId && saved.has(imdbId)), []);

    const toggle = useCallback(
      async (item: MediaItem) => {
        if (!user) {
          showToast(copy.signedOut);
          return;
        }
        if (!listId) {
          showToast(copy.missing);
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
        // Kept so a refused write can put the list back exactly as it was,
        // order included — newest first, which is how it comes back from the
        // server and how the sections read it.
        const before = items;
        setItems(adding ? [title, ...items] : items.filter((t) => t.imdbId !== title.imdbId));
        publish();

        try {
          if (adding) await addToList(listId, title);
          else await removeFromList(listId, title.imdbId);
        } catch (err) {
          setItems(before);
          publish();
          showToast(err instanceof Error ? err.message : "That didn't save.");
        } finally {
          setPending(false);
        }
      },
      [user, showToast],
    );

    return { items, has, toggle, pending, ready: loaded, signedIn: Boolean(user) };
  }

  return { use, reset };
}
