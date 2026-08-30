import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { recommendationsByTmdb, recommendationsFor } from "@/lib/tmdb";
import type { SimilarPayload } from "@cinesync/shared/payloads";

export const revalidate = 86400;

/**
 * How far Show more will go: thirty recommendations, two presses.
 *
 * A bound rather than a feed, for the reason `/api/mood` documents about free
 * paging and cache keys, and because the thirty-first title TMDB's audience
 * data offers for a film has stopped being a recommendation. Most seeds never
 * reach it anyway — the gate runs out first, and `hasMore` says so.
 */
const MAX_PAGE = 3;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { SimilarPayload };

/**
 * "More like this", for one IMDb id.
 *
 * Cached publicly and for a day, which is safe *because of what it does not
 * take*: the seed is an IMDb id and nothing else. The rail this feeds is
 * personal — it is seeded by the last thing the viewer played — but the
 * personal half never leaves the browser, and two people who watched the same
 * film can share one cache entry.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const imdb = params.get("imdb")?.trim() ?? "";
  const tmdb = params.get("tmdb")?.trim() ?? "";
  const kind = params.get("kind")?.trim() ?? "";

  /*
     Two ways in, because the two callers know the seed by different names.

     `BecauseYouWatched` is seeded by Stremio, which only ever speaks IMDb ids.
     Find Similar's picker gets its candidates from TMDB search and has the
     TMDB id already — making it resolve an IMDb id first would add a round
     trip whose entire purpose was to be undone by `findByImdbId`.
  */
  const byTmdb = /^\d+$/.test(tmdb) && (kind === "movie" || kind === "series");
  // Clamped rather than rejected: a page past the end is a client that has
  // lost count, and the last slice is a better answer than a 400.
  const page = Math.min(Math.max(Number(params.get("page")) || 1, 1), MAX_PAGE);

  if (!byTmdb && !/^tt\d+$/.test(imdb)) {
    return Response.json(
      { error: "Pass ?imdb=tt4540710, or ?tmdb=329865&kind=movie" },
      { status: 400 },
    );
  }

  try {
    const { seed, items, hasMore } = byTmdb
      ? await recommendationsByTmdb(Number(tmdb), kind as "movie" | "series", 10, undefined, page)
      : await recommendationsFor(imdb, 10, page);
    // A seed TMDB has never heard of is an empty rail, not a failure: the
    // client renders nothing and the viewer is never told about an id they
    // did not type.
    return Response.json(
      { seed, items, page, hasMore: hasMore && page < MAX_PAGE } satisfies SimilarPayload,
      { headers: CATALOGUE_CACHE },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't find anything similar";
    return Response.json({ error: message }, { status: 502 });
  }
}
