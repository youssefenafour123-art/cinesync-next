import "server-only";

/**
 * Cache headers for the public catalogue routes.
 *
 * Six of the eight tab handlers read a query parameter — a type toggle, a
 * month, a country filter — which makes them dynamic, so Next cannot
 * prerender them the way it does `/api/discover` and `/api/anime`. Measured
 * cold against a local production build, that is the difference between ~8ms
 * and 0.5-2.6s, and the tracker and calendar sit at the slow end.
 *
 * `revalidate` doesn't help there: it governs Next's own data cache, not what
 * the CDN in front of the app is allowed to keep. These headers do, so the
 * cold cost is paid once for everyone rather than once per visitor.
 *
 * `stale-while-revalidate` is the part that matters for how this feels. For a
 * day after a response goes stale the edge keeps serving it instantly and
 * refreshes behind the reader, so nobody waits for TMDB — they just may see an
 * hour-old catalogue, which for "films rated before 2000" is no difference at
 * all.
 *
 * Safe to make public because every one of these routes returns the same
 * catalogue to everybody. Nothing user-specific goes through them: the Stremio
 * proxy, which does carry an auth key, sets `no-store` instead.
 */
export const CATALOGUE_CACHE = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;
