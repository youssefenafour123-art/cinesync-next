"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { stremioAccounts, useSourcesStore } from "@/store/useSourcesStore";
import { useSession } from "./useSession";
import {
  addManyToList,
  fetchListItems,
  fetchSystemListId,
  removeManyFromList,
  type SavedTitle,
} from "./lists";

/**
 * Writes the connected Stremio library into the list followers can read.
 *
 * The library itself is not shareable and cannot be made so: it lives behind
 * an authKey in this browser's localStorage, and the whole point of a follower
 * is that they are somebody else, on somebody else's machine, who must never
 * hold that key. The only way another person sees this library is if this
 * account writes a copy somewhere the visibility policies cover — which is the
 * `is_stremio` list 0010 adds.
 *
 * A mirror, not a record. That is the difference from `useWatchedSync`, which
 * shares the shape and deliberately never re-adds a title the user removed by
 * hand: the Watched list is its own record and is allowed to disagree with
 * Stremio. This one is only ever a picture of what the connected accounts hold
 * *now*, so both halves of the diff are written — a title deleted in the
 * Stremio app leaves here on the next read, and there is no "already sent"
 * memory to keep, because re-deriving the answer from the snapshot is the
 * answer.
 *
 * Mounted once, in `app/page.tsx`, after `useLibrarySync` — which is what
 * refreshes the snapshot this reads, so this costs no request to Stremio.
 */

/** Matches `MERGE_CHUNK` in `systemList.ts`, and is here for the same reason. */
const CHUNK = 250;

/*
   The library this browser last wrote, as `<user>:<sorted ids>`.

   Module scope, because the point is to not rewrite an unchanged library: the
   snapshot refreshes on every focus and `visibilitychange`, and without this
   every alt-tab would cost a read of the list and a diff against it. Per
   browser rather than per row — it is a record of what this tab has already
   done, not a fact about the list, the same reasoning `useWatchedSync` gives
   for keeping its sent-ids in localStorage rather than in a table.

   Not persisted, though, unlike that one. Losing it costs one extra diff on
   the next page load, which writes nothing when the library has not changed;
   keeping it would risk a stale signature skipping a write that was needed.
*/
let lastSignature = "";

function signatureOf(userId: string, ids: string[]): string {
  return `${userId}:${[...ids].sort().join(",")}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function useStremioListSync(): void {
  const { user } = useSession();
  const items = useAppStore((s) => s.libraryItems);
  const loaded = useAppStore((s) => s.libraryLoaded);
  const sources = useSourcesStore((s) => s.sources);
  const connected = stremioAccounts(sources).length > 0;

  // Guards a second pass while the first is still writing — the snapshot
  // refreshes on focus, and a slow first mirror overlapping a refocus would
  // otherwise diff against a list it is halfway through changing.
  const busy = useRef(false);

  useEffect(() => {
    /*
       `connected` and `loaded` are both required, and the reason is the same
       one: an empty local snapshot must never be mistaken for an empty
       library. Signing in on a second machine, or clearing this browser's
       storage, leaves no authKey and therefore no snapshot — and mirroring
       that would delete every title the *other* machine wrote. So nothing runs
       until a Stremio account is connected here and its library has actually
       been read.
    */
    if (!user || !connected || !loaded || busy.current) return;

    const signature = signatureOf(user.id, items.map((e) => e.imdbId));
    if (signature === lastSignature) return;

    busy.current = true;
    void (async () => {
      try {
        const listId = await fetchSystemListId(user.id, "is_stremio");
        // Null until 0010 has been run against this database. The Library tab
        // still shows the library; nobody else can see it yet.
        if (!listId) return;

        const current = await fetchListItems(listId);
        const wanted = new Set(items.map((e) => e.imdbId));
        const held = new Set(current.map((t) => t.imdbId));

        const gone = current.filter((t) => !wanted.has(t.imdbId)).map((t) => t.imdbId);
        const fresh: SavedTitle[] = items
          .filter((e) => !held.has(e.imdbId) && e.title.trim().length > 0)
          .map((e) => ({
            imdbId: e.imdbId,
            kind: e.kind,
            // `list_items_title_length` from 0007 caps this at 300, and a row
            // over it is refused. Clamping here rather than losing the batch
            // it travelled in.
            title: e.title.slice(0, 300),
            poster: e.poster,
          }));

        for (const batch of chunk(gone, CHUNK)) await removeManyFromList(listId, batch);
        for (const batch of chunk(fresh, CHUNK)) await addManyToList(listId, batch);

        lastSignature = signature;
      } catch {
        /*
           Left unrecorded on purpose: `lastSignature` is only advanced by a
           mirror that finished, so a refused write is retried on the next
           refresh rather than being remembered as done. Nothing is shown —
           this runs on a timer nobody pressed, and a toast about a background
           write is an interruption about something the person did not ask for.
        */
      } finally {
        busy.current = false;
      }
    })();
  }, [user, items, loaded, connected]);
}
