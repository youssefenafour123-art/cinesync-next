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
 * Same rationale as the web app's copy: a screen that unmounts and remounts —
 * which every tab does when the navigator drops it — must not start from
 * skeletons and replay its entrance animation, because that reads as the app
 * having reloaded. Keyed by URL rather than URL+nonce so an explicit `reload()`
 * overwrites the entry instead of accumulating one per attempt.
 *
 * In memory only, deliberately. Persisting it to AsyncStorage would mean a
 * cold start showing yesterday's rails before the revalidation lands, and the
 * route handlers behind these URLs are already `revalidate: 3600` — the cache
 * that matters is the server's.
 */
const cache = new Map<string, unknown>();

/**
 * Minimal JSON fetch hook with abort-on-unmount and a session-lived cache.
 *
 * A port of `apps/web/lib/useFetch.ts`, with one difference: `url` is absolute
 * here. The web app fetches its own origin and can pass "/api/discover"; a
 * device has no origin, so callers build the URL with `endpoints` from
 * `@cinesync/shared/api` and it comes out as `${EXPO_PUBLIC_API_BASE}/api/…`.
 *
 * State is stored against the request key and everything else is derived, so a
 * stale response can never be attributed to the wrong URL.
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
        // React Native's fetch rejects an aborted request with a plain Error
        // named "AbortError" rather than the DOMException the browser throws,
        // so this checks the name rather than the constructor.
        if (err instanceof Error && err.name === "AbortError") return;
        // A failed revalidation must not blank out good cached data — the
        // screen keeps showing what it had and simply doesn't update. On a
        // phone this is the common case, not the edge case: it covers every
        // walk out of Wi-Fi range.
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
  // flight, so a returning screen is populated on the first frame.
  const cached = url && cache.has(url) ? (cache.get(url) as T) : null;
  const data = current?.data ?? cached;

  return {
    data,
    loading: Boolean(url) && current === null,
    error: current?.error ?? null,
    reload,
  };
}
