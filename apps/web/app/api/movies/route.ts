import { curate } from "@/lib/tmdb";
import type { MoviesPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Cut-off for "the ratings have settled". Three years is roughly how long a
 * film's average takes to stop drifting once the opening-week enthusiasts
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
 * Curated Picks.
 *
 * Every rail is ranked by Bayesian weighted rating rather than raw
 * `vote_average.desc` — see `curate()` in lib/tmdb.ts. That is what stops
 * "Under the Radar" filling with obscure titles that have nine votes
 * averaging 10, which is exactly what the previous version did.
 */
export async function GET() {
  try {
    const [cult, modern, radar] = await Promise.all([
      // Cult classics: pre-2000, well enough voted to be genuinely established.
      curate(
        "movie",
        {
          "primary_release_date.lte": "1999-12-31",
          "vote_count.gte": "1500",
          sort_by: "vote_average.desc",
        },
        { minVotes: 2000, floor: 7.4, limit: 12, pages: 2 },
      ),

      // Modern masterpieces: this century, broadly acclaimed.
      curate(
        "movie",
        {
          "primary_release_date.gte": "2000-01-01",
          "vote_count.gte": "3000",
          sort_by: "vote_average.desc",
        },
        { minVotes: 4000, floor: 7.5, limit: 12, pages: 2 },
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
        { minVotes: 900, floor: 7, postFloor: 7.2, limit: 12, pages: 4 },
      ),
    ]);

    const payload: MoviesPayload = {
      rails: [
        {
          title: "Cult Classics",
          blurb: "Pre-2000 films that outlived their box office.",
          items: cult,
        },
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
      ],
    };

    return Response.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load picks";
    return Response.json({ error: message }, { status: 502 });
  }
}
