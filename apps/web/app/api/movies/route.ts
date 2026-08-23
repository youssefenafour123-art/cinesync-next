import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { curate } from "@/lib/tmdb";
import type { Rail } from "@/lib/types";
import type { MoviesPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Titles kept per rail, against the twelve a rail shows.
 *
 * The tab was the same twelve films every visit — the ranking is
 * deterministic, so the same query produces the same winners forever. A pool
 * gives it something to rotate through, and `rotateWindow` in the tab moves
 * along it per page load.
 *
 * Not larger than this, and the reason is cost rather than taste: `curate`
 * enriches its whole shortlist, two requests a title, so every extra name here
 * is paid for at the top of the hour when the cache turns over. Twenty-four is
 * two full rails' worth of rotation for a shortlist that stays affordable.
 */
const POOL = 24;

/**
 * Cut-off for "the ratings have settled". Three years is roughly how long a
 * title's average takes to stop drifting once the opening-week enthusiasts
 * stop being the whole sample.
 */
function settledBefore(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().split("T")[0];
}

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { MoviesPayload };

/**
 * Curated Picks, for either catalogue.
 *
 * Every rail is ranked by Bayesian weighted rating rather than raw
 * `vote_average.desc` — see `curate()` in lib/tmdb.ts. That is what stops
 * "Under the Radar" filling with obscure titles that have nine votes
 * averaging 10, which is exactly what the previous version did.
 */
export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") === "tv" ? "tv" : "movie";

  try {
    const rails = type === "movie" ? await movieRails() : await seriesRails();
    return Response.json({ rails } satisfies MoviesPayload, { headers: CATALOGUE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load picks";
    return Response.json({ error: message }, { status: 502 });
  }
}

async function movieRails(): Promise<Rail[]> {
  const [cult, modern, radar] = await Promise.all([
    // Cult classics: pre-2000, well enough voted to be genuinely established.
    curate(
      "movie",
      {
        "primary_release_date.lte": "1999-12-31",
        "vote_count.gte": "1500",
        sort_by: "vote_average.desc",
      },
      { minVotes: 2000, floor: 7.4, limit: POOL, pages: 4, shortlist: 32 },
    ),

    // Modern masterpieces: this century, broadly acclaimed.
    curate(
      "movie",
      {
        "primary_release_date.gte": "2000-01-01",
        "vote_count.gte": "3000",
        sort_by: "vote_average.desc",
      },
      { minVotes: 4000, floor: 7.5, limit: POOL, pages: 4, shortlist: 32 },
    ),

    // Under the radar: genuinely well regarded, but never went mainstream.
    //
    // Three constraints do the work here:
    //  - a vote window: enough votes for the rating to mean something, few
    //    enough that the film isn't common knowledge;
    //  - an age cut-off: fresh releases carry inflated early ratings from
    //    their most enthusiastic audience, which is how a 926-vote title
    //    briefly outranked everything;
    //  - `postFloor`, so the IMDb rating gets the final say on quality.
    curate(
      "movie",
      {
        "primary_release_date.lte": settledBefore(),
        "vote_count.gte": "300",
        "vote_count.lte": "4000",
        "vote_average.gte": "7",
        sort_by: "vote_average.desc",
        // Documentaries, concert films and TV movies distort this rail.
        without_genres: "99,10402,10770",
      },
      { minVotes: 900, floor: 7, postFloor: 7.2, limit: POOL, pages: 6, shortlist: 40 },
    ),
  ]);

  return [
    { title: "Cult Classics", blurb: "Pre-2000 films that outlived their box office.", items: cult },
    {
      title: "Modern Masterpieces",
      blurb: "This century's most widely acclaimed work.",
      items: modern,
    },
    {
      title: "Under the Radar",
      blurb: "Strongly rated, rarely mentioned — the good stuff nobody brings up.",
      items: radar,
    },
  ];
}

/**
 * The same three ideas against the series catalogue.
 *
 * The thresholds are not the film ones. A series draws far fewer TMDB votes
 * than a film of comparable standing — one entry covers a whole run, and
 * people rate a show once rather than per season — so the film floors return
 * a handful of results and an empty-looking tab. Pre-2000 television is the
 * extreme case: almost nothing from that era clears 1500 votes, which is why
 * "Long Runners" replaces "Cult Classics" rather than being it with a smaller
 * number. Ranking still uses the weighted rating, so a low floor cannot be
 * gamed by a show with nine votes.
 *
 * `without_genres` also differs: the film rail excludes documentaries, music
 * and TV movies, while here the noise is news (10763), talk shows (10767),
 * reality (10764) and soaps (10766) — formats that are rated on a different
 * scale from drama and swamp any list they are allowed into.
 */
async function seriesRails(): Promise<Rail[]> {
  const NON_DRAMA = "99,10763,10767,10764,10766";

  const [longRunners, modern, radar] = await Promise.all([
    curate(
      "tv",
      {
        "first_air_date.lte": "2005-12-31",
        "vote_count.gte": "300",
        sort_by: "vote_average.desc",
        without_genres: NON_DRAMA,
      },
      { minVotes: 500, floor: 7.4, limit: POOL, pages: 4, shortlist: 32 },
    ),

    curate(
      "tv",
      {
        "first_air_date.gte": "2006-01-01",
        "vote_count.gte": "800",
        sort_by: "vote_average.desc",
        without_genres: NON_DRAMA,
      },
      { minVotes: 1200, floor: 7.5, limit: POOL, pages: 4, shortlist: 32 },
    ),

    curate(
      "tv",
      {
        "first_air_date.lte": settledBefore(),
        "vote_count.gte": "80",
        "vote_count.lte": "900",
        "vote_average.gte": "7",
        sort_by: "vote_average.desc",
        without_genres: NON_DRAMA,
      },
      { minVotes: 200, floor: 7, postFloor: 7.2, limit: POOL, pages: 6, shortlist: 40 },
    ),
  ]);

  return [
    {
      title: "Long Runners",
      blurb: "Shows that were already classics before streaming existed.",
      items: longRunners,
    },
    {
      title: "Modern Masterpieces",
      blurb: "The prestige era's most widely acclaimed work.",
      items: modern,
    },
    {
      title: "Under the Radar",
      blurb: "Strongly rated, rarely mentioned — the good stuff nobody brings up.",
      items: radar,
    },
  ];
}
