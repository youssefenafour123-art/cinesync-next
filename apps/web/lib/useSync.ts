"use client";

import { useCallback, useRef, useState } from "react";
import {
  fetchLibrarySnapshot,
  putSyncItems,
  SYNC_BATCH,
  type LibrarySnapshot,
} from "./stremio";
import { stremioAccounts, useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import type { HistoryEntry, SyncItem } from "./types";

export type SyncPhase = "idle" | "running" | "done" | "cancelled" | "blocked";

export interface SyncState {
  phase: SyncPhase;
  title: string;
  detail: string;
  percent: number;
  added: number;
  skipped: number;
  failed: number;
}

const INITIAL: SyncState = {
  phase: "idle",
  title: "Ready to Sync",
  detail: "",
  percent: 0,
  added: 0,
  skipped: 0,
  failed: 0,
};

/** Small pause between batches so Stremio doesn't rate-limit the run. */
const THROTTLE_MS = 100;

/** Splits a list into runs of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Merges every connected IMDb CSV into every connected Stremio account.
 *
 * The legacy version posted to `/api/datastorePut`, which the old server never
 * routed, so every write 404'd while the UI still counted it as a failure and
 * finished with "Sync Complete". Writes now go through `lib/stremio.ts`, which
 * builds the `/api/stremio/...` path in one place.
 */
export function useSync() {
  const [state, setState] = useState<SyncState>(INITIAL);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);

  const sources = useSourcesStore((s) => s.sources);
  const addHistory = useSourcesStore((s) => s.addHistory);
  const setLibrary = useAppStore((s) => s.setLibrary);

  const reset = useCallback(() => {
    cancelRef.current = false;
    setState(INITIAL);
  }, []);

  const cancel = useCallback(() => {
    if (runningRef.current) {
      cancelRef.current = true;
      setState((s) => ({ ...s, detail: "Cancelling after the current item…" }));
    } else {
      reset();
    }
  }, [reset]);

  const start = useCallback(async () => {
    if (runningRef.current) return;

    const accounts = stremioAccounts(sources);

    // Merge every IMDb source — URL-imported lists and CSV uploads alike —
    // deduping by IMDb id so the same title across two lists syncs once.
    const pending = new Map<string, SyncItem>();
    for (const s of sources) {
      if (s.type === "imdb_list" || s.type === "imdb_csv") {
        for (const i of s.items) pending.set(i.id, i);
      }
    }
    const items = Array.from(pending.values());

    if (!items.length || !accounts.length) {
      setState({
        ...INITIAL,
        phase: "blocked",
        title: "Nothing to sync",
        detail:
          !accounts.length && !items.length
            ? "Connect a Stremio account and add an IMDb list first."
            : !accounts.length
              ? "Connect at least one Stremio account first."
              : "Add at least one IMDb list first.",
      });
      return;
    }

    runningRef.current = true;
    cancelRef.current = false;
    setState({
      ...INITIAL,
      phase: "running",
      title: "Sync in Progress",
      detail: "Fetching remote libraries…",
    });

    // Read each library once up front so already-present titles are skipped
    // instead of re-written.
    const existing = new Map<string, LibrarySnapshot>();
    for (const acc of accounts) {
      existing.set(acc.authKey, await fetchLibrarySnapshot(acc.authKey));
    }

    // Two sets, because "don't write this again" and "show it as In Library"
    // stopped being the same question once deletions became visible. A title
    // the user removed in Stremio is still in `known` — so sync leaves it
    // alone rather than resurrecting it — but it is no longer in `inLibrary`,
    // so it carries no badge.
    const allInLibrary = new Set<string>();
    const allKnown = new Set<string>();
    for (const snap of existing.values()) {
      for (const id of snap.inLibrary) allInLibrary.add(id);
      for (const id of snap.known) allKnown.add(id);
    }
    setLibrary({ inLibrary: new Set(allInLibrary), known: new Set(allKnown) });

    const total = items.length * accounts.length;
    let done = 0;
    let added = 0;
    let skipped = 0;
    let failed = 0;
    const imported: HistoryEntry[] = [];
    // One history entry per title, however many accounts it landed in.
    const loggedIds = new Set<string>();

    /*
       Accounts outside, titles inside — the reverse of how this read before.

       It used to walk the titles and, for each, write to every account: one
       request per title per account, a hundred milliseconds apart. Two hundred
       titles was two hundred requests at ten a second, and the proxy in front
       of api.strem.io allows thirty a minute per address per method, so the
       first thirty were written and everything after them came back 429 and
       was counted as a failure. That is what "most of my CSV failed" was.

       `changes` takes an array, so a hundred titles now go in one request and
       the same import is two of them. Batching only makes sense per account —
       the payload carries no account, the authKey does — which is why the
       loops swapped round.
    */
    for (const acc of accounts) {
      if (cancelRef.current) break;

      const lib = existing.get(acc.authKey);

      // Anything this account already knows is counted, not written. `known`
      // holds rows the user deleted in Stremio too, which is the point: a sync
      // must not resurrect them.
      const fresh: SyncItem[] = [];
      for (const item of items) {
        if (lib?.known.has(item.id)) {
          skipped++;
          done++;
        } else {
          fresh.push(item);
        }
      }
      setState((s) => ({ ...s, percent: Math.round((done / total) * 100), skipped }));

      for (const batch of chunk(fresh, SYNC_BATCH)) {
        if (cancelRef.current) break;

        setState((s) => ({
          ...s,
          detail:
            batch.length === 1
              ? `Syncing: ${batch[0].title}`
              : `Syncing ${batch.length} titles, from ${batch[0].title}…`,
        }));

        /*
           The batch, then its titles one at a time only if that is refused.

           Same shape as `merge` in `systemList.ts`, for the same reason: one
           row Stremio dislikes should cost one title, not the ninety-nine it
           happened to travel with.
        */
        let landed = batch;
        let attempted = batch.length;
        try {
          await putSyncItems(batch, acc.authKey);
        } catch {
          landed = [];
          attempted = 0;
          for (const item of batch) {
            if (cancelRef.current) break;
            attempted++;
            try {
              await putSyncItems([item], acc.authKey);
              landed.push(item);
            } catch {
              failed++;
            }
          }
        }

        for (const item of landed) {
          added++;
          lib?.known.add(item.id);
          lib?.inLibrary.add(item.id);
          allKnown.add(item.id);
          allInLibrary.add(item.id);

          if (!loggedIds.has(item.id)) {
            loggedIds.add(item.id);
            imported.unshift({
              id: item.id,
              title: item.title,
              type: item.type,
              timestamp: Date.now(),
            });
          }
        }

        done += attempted;
        setState((s) => ({
          ...s,
          percent: Math.round((done / total) * 100),
          added,
          skipped,
          failed,
        }));
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    if (imported.length) addHistory(imported);
    setLibrary({ inLibrary: new Set(allInLibrary), known: new Set(allKnown) });

    const cancelled = cancelRef.current;
    runningRef.current = false;

    setState((s) => ({
      ...s,
      phase: cancelled ? "cancelled" : "done",
      title: cancelled ? "Sync Cancelled" : "Sync Complete",
      detail: cancelled
        ? `Stopped after ${done} of ${total} operations.`
        : failed > 0
          ? `${added} added, ${failed} failed. Failures usually mean an expired Stremio session.`
          : "Your library is up to date.",
      percent: cancelled ? s.percent : 100,
    }));
  }, [sources, addHistory, setLibrary]);

  return { state, start, cancel, reset, running: state.phase === "running" };
}
