import { discoverEnriched, isoDate } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";

export const revalidate = 3600;

export interface TrackerPayload {
  hero: MediaItem[];
  upcoming: MediaItem[];
  released: MediaItem[];
}

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
    return Response.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tracker data";
    return Response.json({ error: message }, { status: 502 });
  }
}
