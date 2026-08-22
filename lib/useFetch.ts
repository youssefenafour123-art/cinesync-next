"use client";

import { useCallback, useEffect, useState } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface Settled<T> {
  /** The `url|nonce` this result belongs to. */
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * Results already fetched this session, keyed by URL.
 *
 * The tab shell in `page.tsx` keys its container on the active tab, so every
 * tab switch unmounts the outgoing tab entirely and mounts the incoming one
 * fresh. Without this, that meant each visit started from `settled === null` —
 * skeletons, a re-fetch, and every entrance animation replaying — so returning
 * to a tab looked exactly like the page had reloaded. It was reported as
 * "clicking the logo refreshes the page", which is the same code path: the logo
 * selects the Discover tab.
 *
 * Keyed by URL rather than by URL+nonce, so an explicit `reload()` overwrites
 * the entry rather than accumulating one per attempt.
 */
const cache = new Map<string, unknown>();

/**
 * Minimal JSON fetch hook with abort-on-unmount and a session-lived cache.
 *
 * State is stored against the request key and everything else is derived, so
 * switching URLs shows a loading state without an extra synchronous setState
 * pass — a stale result can never be attributed to the wrong URL.
 *
 * A cached URL renders immediately and still revalidates in the background, so
 * a returning tab is populated on the first frame and picks up fresh data a
 * moment later. Nothing is evicted: these are a handful of catalogue responses
 * per session, and the route handlers behind them are already `revalidate:
 * 3600` — the cache that matters is the server's.
 *
 * Each tab hits exactly one of our own cached route handlers, which is why
 * this stays this small: the per-item TMDB/Cinemeta fan-out that made the
 * legacy anime tab fire ~160 browser requests now happens once, on the server.
 */
export function useFetch<T>(url: string | null): FetchState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const key = url ? `${url}|${nonce}` : null;

  useEffect(() => {
    if (!key || !url) return;

    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((json as { error?: string })?.error || `Request failed (${res.status})`);
        }
        return json as T;
      })
      .then((data) => {
        cache.set(url, data);
        setSettled({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // A failed revalidation must not blank out good cached data — the tab
        // keeps showing what it had and simply doesn't update.
        if (cache.has(url)) return;
        setSettled({
          key,
          data: null,
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      });

    return () => controller.abort();
  }, [key, url]);

  const current = settled?.key === key ? settled : null;

  // Falls back to the cached body for this URL while the revalidation is in
  // flight. `loading` stays true so a tab can still show a subtle pending hint,
  // but `data` being non-null means it renders content instead of skeletons.
  const cached = url && cache.has(url) ? (cache.get(url) as T) : null;
  const data = current?.data ?? cached;

  return {
    data,
    loading: Boolean(url) && current === null,
    error: current?.error ?? null,
    reload,
  };
}
