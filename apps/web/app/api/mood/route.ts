import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { curate, findMood, moodQuery, moodsFor } from "@/lib/tmdb";
import type { MoodPayload } from "@cinesync/shared/payloads";
import type { MediaKind } from "@/lib/types";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { MoodPayload };

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const kind: MediaKind = params.get("type") === "tv" ? "series" : "movie";
  const endpoint = kind === "movie" ? "movie" : "tv";

  // The catalogue is per-kind: a mood with no honest series equivalent is not
  // offered at all rather than offered and then empty. See `Mood.tv`.
  const available = moodsFor(kind);
  const catalogue = available.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb }));

  /*
     Fall back to the first available mood whenever the requested one isn't on
     offer for this kind — an unknown id, or a film-only mood asked for against
     the series catalogue.

     Both cases have to land on the *same* mood the tab highlights, and the tab
     highlights `moods[0]` when its own selection is missing from the
     catalogue. Returning `rail: null` here instead would leave the first chip
     looking selected above an empty section, which is what switching to
     Series with Horror picked used to do.
  */
  const requested = params.get("id");
  const asked = requested ? findMood(requested) : undefined;
  const offered = asked && !(kind === "series" && asked.tv === null) ? asked : available[0];

  if (!offered) {
    return Response.json({ moods: catalogue, rail: null } satisfies MoodPayload, { headers: CATALOGUE_CACHE });
  }
  const mood = offered;

  try {
    const query = moodQuery(mood, kind);
    /*
       Twice what the tab shows, so "Show more" has somewhere to go.

       Same pool size and shape as `app/api/movies/route.ts` (`POOL = 24`),
       and deliberately not a `?size=` or `?page=` parameter: that would
       multiply the cache entries behind every mood times every kind, which is
       the trap `lib/calendar.ts` documents for `month`. One pool, fetched
       once, expanded on the client for free.
    */
    const items = await curate(
      endpoint,
      { ...query.params, sort_by: "vote_average.desc" },
      { minVotes: query.minVotes, floor: query.floor, limit: 24, pages: 3, shortlist: 32 },
    );

    return Response.json({
      moods: catalogue,
      rail: { title: mood.label, blurb: mood.blurb, items },
    } satisfies MoodPayload, { headers: CATALOGUE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load that mood";
    return Response.json({ error: message }, { status: 502 });
  }
}
