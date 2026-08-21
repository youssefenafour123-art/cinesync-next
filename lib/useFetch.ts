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
 * Minimal JSON fetch hook with abort-on-unmount.
 *
 * State is stored against the request key and everything else is derived, so
 * switching URLs shows a loading state without an extra synchronous setState
 * pass — a stale result can never be attributed to the wrong URL.
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
      .then((data) => setSettled({ key, data, error: null }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSettled({
          key,
          data: null,
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      });

    return () => controller.abort();
  }, [key, url]);

  const current = settled?.key === key ? settled : null;

  return {
    data: current?.data ?? null,
    loading: Boolean(url) && current === null,
    error: current?.error ?? null,
    reload,
  };
}
