import { fetchTopCatalog } from "@/lib/cinemeta";
import type { MediaItem } from "@/lib/types";

export const revalidate = 3600;

export interface DiscoverPayload {
  /** Rotating hero slides — the most-watched titles right now. */
  hero: MediaItem[];
  rails: { title: string; items: MediaItem[] }[];
  /** Posters for the parallax background wall. */
  wall: string[];
}

export async function GET() {
  const [movies, series] = await Promise.all([
    fetchTopCatalog("movie"),
    fetchTopCatalog("series"),
  ]);

  // Interleave films and shows so the slider isn't six movies in a row.
  const hero: MediaItem[] = [];
  for (let i = 0; i < 4; i++) {
    if (movies[i]) hero.push(movies[i]);
    if (series[i]) hero.push(series[i]);
  }

  const payload: DiscoverPayload = {
    hero: hero.filter((h) => h.backdrop || h.poster).slice(0, 6),
    rails: [
      { title: "Most Watched Movies", items: movies.slice(0, 18) },
      { title: "Most Watched Series", items: series.slice(0, 18) },
    ],
    wall: [...movies, ...series]
      .map((m) => m.poster)
      .filter((p): p is string => Boolean(p))
      .slice(0, 28),
  };

  return Response.json(payload);
}
