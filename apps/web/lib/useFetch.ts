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

/** Requests in flight, keyed by URL, so the same URL is only ever asked once. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * One request per URL, shared by everyone who wants it.
 *
 * Deduplication is not a micro-optimisation here. Landing on Discover fired
 * `/api/discover` three times: the tab asked for it, the ambient background
 * asked for it independently for its poster wall, and the browser's own cache
 * only absorbed one of the two — 40KB downloaded and parsed twice before
 * anything else could start. The idle sweep and the hover handler would have
 * added more of the same.
 *
 * Sharing the promise means a second caller for a URL already in flight waits
 * on the first instead of starting its own, whether it is a component
 * rendering, a prefetch guessing, or a pointer hovering a nav item.
 *
 * `cache` is written here rather than by the caller, so every path that can
 * fetch a URL also populates it. Errors deliberately do not write, which is
 * what lets a failed revalidation leave good data in place.
 */
function load<T>(url: string): Promise<T> {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const run = fetch(url)
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((json as { error?: string })?.error || `Request failed (${res.status})`);
      }
      cache.set(url, json);
      return json as T;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, run);
  return run;
}

/**
 * Drops everything cached this session.
 *
 * The cache is keyed by URL and nothing else, which is exactly right while
 * every route returns the same catalogue to everybody. It stops being right
 * the moment a URL's answer depends on who is asking: sign out and back in as
 * someone else in the same tab, and the first account's responses are still
 * sitting in this map, ready to be served on the first frame.
 *
 * So authentication changes clear it — see `lib/auth.ts`. `inflight` goes too:
 * a request that was already in the air belongs to the previous session, and
 * letting it settle would write that answer straight back into the cache.
 */
export function clearFetchCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * The shared loader, for the one place that needs a payload without rendering
 * it — `AmbientBackground` pulls the poster wall out of the Discover payload
 * whichever tab it happens to mount on.
 */
export function fetchShared<T>(url: string): Promise<T> {
  // Cache-first, unlike `useFetch`. This serves a caller that wants the
  // payload once and has no way to show a newer one — the wall is a running
  // marquee, and swapping its posters mid-scroll to say the same thing is
  // worse than being an hour stale. `useFetch` still revalidates on mount,
  // because a tab re-render can absorb fresh data without anyone noticing.
  if (cache.has(url)) return Promise.resolve(cache.get(url) as T);
  return load<T>(url);
}

/**
 * Warms the cache for a URL a tab is *about* to want.
 *
 * Switching tabs was only ever instant the second time: the cache above is
 * filled by rendering, so the first visit to each tab paid its route handler's
 * full cost with skeletons on screen. Most of those handlers read a query
 * parameter, which makes them dynamic — the tracker and the calendar were
 * measured at ~2.5s cold against a local production build, and the network
 * sits on top of that.
 *
 * So the fetch is moved off the critical path instead of being made faster:
 * by the time a tab is clicked its payload is usually already here, and
 * `useFetch` renders from cache on the first frame.
 *
 * Failures are swallowed on purpose. A prefetch is a guess about what someone
 * will do next; if it is wrong, or offline, the tab's own fetch reports the
 * error when it actually matters.
 */
export function prefetch(url: string): void {
  if (typeof window === "undefined" || cache.has(url)) return;
  void load(url).catch(() => {});
}

/**
 * Minimal JSON fetch hook over the shared loader, with a session-lived cache.
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

    /*
       A flag rather than an AbortController.

       The request belongs to `load` now and may be shared with another
       component or a prefetch, so aborting on unmount would cancel work
       somebody else is waiting on. Letting it finish also fills the cache,
       which is the whole point — switching away from a tab mid-load and back
       should find the payload waiting, not start again.
    */
    let active = true;

    load<T>(url)
      .then((data) => {
        if (active) setSettled({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!active) return;
        // A failed revalidation must not blank out good cached data — the tab
        // keeps showing what it had and simply doesn't update.
        if (cache.has(url)) return;
        setSettled({
          key,
          data: null,
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      });

    return () => {
      active = false;
    };
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
