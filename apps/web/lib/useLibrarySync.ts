"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLibrarySnapshot, mergeSnapshots, type LibrarySnapshot } from "./stremio";
import { stremioAccounts, useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import type { Source } from "./types";

/** Ignore an unforced refresh this soon after the last one. */
const MIN_INTERVAL_MS = 10_000;

// Module scope on purpose: the automatic refresher and the Library tab's
// button share one throttle, so tabbing back in and immediately pressing
// Refresh doesn't fire two reads of the same libraries.
let lastRun = 0;
let inFlight: Promise<void> | null = null;

async function refreshLibrary(
  sources: Source[],
  setLibrary: (snapshot: LibrarySnapshot) => void,
  force: boolean,
): Promise<void> {
  const accounts = stremioAccounts(sources);
  if (!accounts.length) return;
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return;

  inFlight = (async () => {
    try {
      const snapshots = await Promise.all(accounts.map((a) => fetchLibrarySnapshot(a.authKey)));
      setLibrary(mergeSnapshots(snapshots));
      lastRun = Date.now();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Keeps the app's picture of the connected Stremio libraries current.
 *
 * Reading it once on mount was not enough: those libraries are also edited
 * from the Stremio app and from web.stremio.com, so a title deleted there
 * stayed badged "In Library" here until a full page reload. Both of those
 * edits happen while this tab is in the background, which makes coming back to
 * the tab the moment the snapshot is most likely stale — hence the refetch on
 * focus and on `visibilitychange`, throttled so alt-tabbing repeatedly doesn't
 * hammer the proxy.
 *
 * Mounted once, in `app/page.tsx`. Components that want to trigger a read use
 * `useLibraryRefresh`, which shares this module's throttle.
 */
export function useLibrarySync() {
  const hydrated = useSourcesStore((s) => s.hydrated);
  const sources = useSourcesStore((s) => s.sources);
  const setLibrary = useAppStore((s) => s.setLibrary);

  // Connecting or removing an account changes the answer, so that read is not
  // throttled.
  useEffect(() => {
    if (!hydrated) return;
    void refreshLibrary(sources, setLibrary, true);
  }, [hydrated, sources, setLibrary]);

  useEffect(() => {
    const onFocus = () => void refreshLibrary(sources, setLibrary, false);
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sources, setLibrary]);
}

/**
 * Manual re-read, for when the deletion happened somewhere this tab can't
 * observe — the phone app, mostly, which never takes focus away from here.
 */
export function useLibraryRefresh() {
  const sources = useSourcesStore((s) => s.sources);
  const setLibrary = useAppStore((s) => s.setLibrary);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setPending(true);
    try {
      await refreshLibrary(sources, setLibrary, true);
    } finally {
      setPending(false);
    }
  }, [sources, setLibrary]);

  return { refresh, pending, connected: stremioAccounts(sources).length > 0 };
}
