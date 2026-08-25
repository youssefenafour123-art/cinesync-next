"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";
import { useAppStore } from "@/store/useAppStore";
import type { ListSummary, SavedTitle, Visibility } from "./lists";
import {
  addToList,
  createList,
  deleteList,
  fetchMyLists,
  removeFromList,
  setListVisibility,
} from "./lists";

/**
 * The signed-in user's lists, held once for the whole app.
 *
 * Module scope for the same reason as `useWatchlist`: the Library tab renders
 * these and the details modal offers them as somewhere to add a title, so two
 * copies would let a list's item count disagree with the list itself the
 * moment anything was added from the modal.
 *
 * The watchlist is in here too — it is a `lists` row like any other. Consumers
 * that mean "the lists the user made" want `custom`, which drops it, because
 * the watchlist already has its own button and its own section.
 */
let lists: ListSummary[] = [];
let loaded = false;
let inFlight: Promise<void> | null = null;

const subscribers = new Set<() => void>();
function publish() {
  for (const fn of subscribers) fn();
}

async function load(userId: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      lists = await fetchMyLists(userId);
    } catch {
      // An unreadable list collection shows as none, which is the safe way to
      // be wrong: nothing claims to exist that might not.
      lists = [];
    } finally {
      loaded = true;
      inFlight = null;
      publish();
    }
  })();
  return inFlight;
}

/** Forget everything — a different account has different lists. */
export function resetLists(): void {
  lists = [];
  loaded = false;
  publish();
}

/**
 * Keeps the count on a list row in step with a write to its items.
 *
 * The count arrives as an aggregate from the server, so without this a title
 * added from the details modal would leave the Library tab reading one fewer
 * until something refetched.
 */
function bumpCount(listId: string, delta: number): void {
  lists = lists.map((l) =>
    l.id === listId ? { ...l, itemCount: Math.max(0, l.itemCount + delta) } : l,
  );
  publish();
}

export function useLists() {
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
      resetLists();
      return;
    }
    if (!loaded) void load(user.id);
  }, [user]);

  /*
     Every action below reports its own failure and resolves to whether it
     worked, rather than throwing. The callers are click handlers; an
     unhandled rejection in one is an error nobody sees.
  */

  /**
   * Makes a list and hands back its id, or null if it wasn't made.
   *
   * The id rather than a boolean, because the caller in the details modal
   * creates a list in order to put the open title straight into it — and
   * finding the new row again afterwards would mean guessing which of several
   * same-named lists it was.
   */
  const create = useCallback(
    async (name: string, visibility: Visibility): Promise<string | null> => {
      setPending(true);
      try {
        const id = await createList(name, { visibility });
        // Appended rather than refetched. `fetchMyLists` orders by creation,
        // watchlist first, so the end of the array is where this belongs.
        lists = [...lists, { id, name: name.trim(), visibility, isWatchlist: false, itemCount: 0 }];
        publish();
        return id;
      } catch (err) {
        showToast(err instanceof Error ? err.message : "That list wasn't created.");
        return null;
      } finally {
        setPending(false);
      }
    },
    [showToast],
  );

  const remove = useCallback(
    async (listId: string): Promise<boolean> => {
      const before = lists;
      lists = lists.filter((l) => l.id !== listId);
      publish();
      setPending(true);
      try {
        await deleteList(listId);
        return true;
      } catch (err) {
        lists = before;
        publish();
        showToast(err instanceof Error ? err.message : "That list wasn't deleted.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [showToast],
  );

  const setVisibility = useCallback(
    async (listId: string, visibility: Visibility): Promise<boolean> => {
      const before = lists;
      lists = lists.map((l) => (l.id === listId ? { ...l, visibility } : l));
      publish();
      try {
        await setListVisibility(listId, visibility);
        return true;
      } catch (err) {
        lists = before;
        publish();
        showToast(err instanceof Error ? err.message : "That didn't save.");
        return false;
      }
    },
    [showToast],
  );

  const addTitle = useCallback(
    async (listId: string, title: SavedTitle): Promise<boolean> => {
      bumpCount(listId, 1);
      try {
        await addToList(listId, title);
        return true;
      } catch (err) {
        bumpCount(listId, -1);
        showToast(err instanceof Error ? err.message : "That didn't save.");
        return false;
      }
    },
    [showToast],
  );

  const removeTitle = useCallback(
    async (listId: string, imdbId: string): Promise<boolean> => {
      bumpCount(listId, -1);
      try {
        await removeFromList(listId, imdbId);
        return true;
      } catch (err) {
        bumpCount(listId, 1);
        showToast(err instanceof Error ? err.message : "That didn't save.");
        return false;
      }
    },
    [showToast],
  );

  return {
    lists,
    /** The lists the user made, without the watchlist the trigger made for them. */
    custom: lists.filter((l) => !l.isWatchlist),
    ready: loaded,
    signedIn: Boolean(user),
    pending,
    create,
    remove,
    setVisibility,
    addTitle,
    removeTitle,
    reload: load,
  };
}
