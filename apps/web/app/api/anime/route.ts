import { ANIME_FILTER, curate, discoverEnriched, isoDate } from "@/lib/tmdb";
import type { AnimePayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { AnimePayload };

export async function GET() {
  const today = isoDate();
  const twoMonthsAgo = isoDate(-2);

  try {
    const [top, airing, upcoming, gems] = await Promise.all([
      // Top rated: weighted, so a niche show with 1,001 votes can't outrank
      // a landmark series with 20,000.
      curate(
        "tv",
        { ...ANIME_FILTER, sort_by: "vote_average.desc", "vote_count.gte": "1000" },
        { minVotes: 1500, floor: 7.5, limit: 20, pages: 2 },
      ),

      // These two are chronological by nature, so they stay unranked.
      discoverEnriched("tv", {
        ...ANIME_FILTER,
        "first_air_date.gte": twoMonthsAgo,
        "first_air_date.lte": today,
        sort_by: "popularity.desc",
      }),
      discoverEnriched("tv", {
        ...ANIME_FILTER,
        "first_air_date.gte": today,
        sort_by: "popularity.desc",
      }),

      // Hidden gems: same treatment as Under the Radar — a real vote window
      // plus an IMDb floor after enrichment, so "highly rated" means it.
      curate(
        "tv",
        {
          ...ANIME_FILTER,
          sort_by: "vote_average.desc",
          "vote_count.gte": "80",
          "vote_count.lte": "700",
          "vote_average.gte": "7",
          "first_air_date.lte": isoDate(-36),
        },
        { minVotes: 250, floor: 7, postFloor: 7.2, limit: 20, pages: 3 },
      ),
    ]);

    const payload: AnimePayload = {
      rails: [
        { title: "Top Rated Anime", blurb: "Weighted by vote volume, not raw average.", items: top },
        { title: "Currently Airing", items: airing },
        { title: "Upcoming", items: upcoming },
        {
          title: "Hidden Gems",
          blurb: "Strongly rated, barely watched — at least three years old, so the scores are real.",
          items: gems,
        },
      ],
    };

    return Response.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load anime";
    return Response.json({ error: message }, { status: 502 });
  }
}
