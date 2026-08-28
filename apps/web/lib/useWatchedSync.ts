"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useWatched } from "./useWatched";
import type { SavedTitle } from "./lists";

/**
 * Where the ids already sent to the Watched list are remembered.
 *
 * Per browser rather than per account row, for the same reason
 * `knownLibraryIds` lives in the client: it is not a fact about the list, it
 * is a record of what this sync has already done, and writing it to the
 * database would mean a table whose only purpose is to remember not to repeat
 * yourself.
 */
const SENT_KEY = "cineSyncWatchedSynced";

function readSent(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSent(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or private mode. The cost is that a title removed from the list
    // can come back on the next sync, which is worth less than throwing.
  }
}

/**
 * Puts what Stremio has finished into the Watched list.
 *
 * One direction only. Stremio knows what was played and this app does not, so
 * it is the source; going the other way would mean writing playback state into
 * somebody's library from a website that never played anything.
 *
 * The whole difficulty is the second half of "automatically adds": a sync that
 * only compares Stremio against the list will re-add every title the user
 * removes from it, for ever, and the removal control becomes a lie. So every
 * id this sync writes is remembered, and an id it has already written is never
 * written again — exactly the shape `knownLibraryIds` uses to stop a deleted
 * title being resurrected by the next IMDb merge.
 *
 * What that buys, concretely:
 *
 *   - finish something in Stremio, and it appears here on the next read;
 *   - remove it here, and it stays gone, however many times Stremio is read;
 *   - add something here by hand that Stremio has never seen, and nothing
 *     touches it.
 *
 * Mounted once, in `app/page.tsx`, beside `useLibrarySync` — which is what
 * actually refreshes the snapshot this reads.
 */
export function useWatchedSync(): void {
  const stremioWatched = useAppStore((s) => s.stremioWatched);
  const { merge, ready, signedIn } = useWatched();

  /*
     Guards a second pass while the first is still writing.

     `merge` is a row per title and the snapshot refreshes on focus, so without
     this a slow first sync overlapping a refocus would send the same titles
     twice. The upsert makes that harmless in the database and wasteful
     everywhere else.
  */
  const busy = useRef(false);

  useEffect(() => {
    if (!signedIn || !ready || stremioWatched.length === 0 || busy.current) return;

    const sent = readSent();
    const candidates: SavedTitle[] = stremioWatched
      .filter((w) => !sent.has(w.imdbId))
      .map((w) => ({
        imdbId: w.imdbId,
        kind: w.kind,
        title: w.title,
        poster: w.poster,
      }));

    if (candidates.length === 0) return;

    busy.current = true;
    void (async () => {
      try {
        const added = await merge(candidates);
        /*
           Every candidate is recorded, not only the ones written.

           A title already in the list comes back from `merge` as "not added",
           and if that meant "try again next time" the sync would re-offer it
           on every focus for the life of the account. Being considered once is
           the thing worth remembering.
        */
        for (const t of candidates) sent.add(t.imdbId);
        writeSent(sent);
        void added;
      } catch {
        /*
           `merge` throws when the account has no watched list to write to —
           before 0008 has been run, mostly. Nothing is recorded as sent, so
           the next refresh tries again, and nothing is shown: this runs on a
           timer nobody pressed.
        */
      } finally {
        busy.current = false;
      }
    })();
  }, [stremioWatched, merge, ready, signedIn]);
}
