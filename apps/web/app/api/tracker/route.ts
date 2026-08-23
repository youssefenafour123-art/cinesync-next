import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { discoverEnriched, isoDate } from "@/lib/tmdb";
import type { TrackerPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { TrackerPayload };

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") === "tv" ? "tv" : "movie";
  const today = isoDate();
  const twoMonthsAgo = isoDate(-2);

  // TMDB uses different date fields for movies vs TV.
  const gte = type === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
  const lte = type === "movie" ? "primary_release_date.lte" : "first_air_date.lte";

  try {
    const [upcoming, released] = await Promise.all([
      discoverEnriched(type, { [gte]: today, sort_by: "popularity.desc" }),
      discoverEnriched(type, {
        [lte]: today,
        [gte]: twoMonthsAgo,
        sort_by: "popularity.desc",
      }),
    ]);

    // Hero prefers titles that actually have a trailer to play.
    const all = [...upcoming, ...released];
    const withTrailer = all.filter((m) => m.trailerKey && m.backdrop);
    const hero = (withTrailer.length ? withTrailer : all).slice(0, 5);

    const payload: TrackerPayload = { hero, upcoming, released };
    return Response.json(payload, { headers: CATALOGUE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tracker data";
    return Response.json({ error: message }, { status: 502 });
  }
}
