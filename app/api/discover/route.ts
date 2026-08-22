import { fetchTopCatalog } from "@/lib/cinemeta";
import { posterWall } from "@/lib/tmdb";
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
  const [movies, series, tmdbMovies, tmdbSeries] = await Promise.all([
    fetchTopCatalog("movie"),
    fetchTopCatalog("series"),
    // Cinemeta's top catalog caps at 50 per kind, which barely covers the wall's
    // own grid and leaves nothing for it to cross-fade in. TMDB tops the pool up
    // with poster URLs only — no per-title enrichment.
    posterWall("movie"),
    posterWall("tv"),
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
    wall: buildWall(movies, series, tmdbMovies, tmdbSeries),
  };

  return Response.json(payload);
}

/**
 * The background wall's poster pool.
 *
 * Interleaved so neither the grid nor the cross-fade queue is a solid block of
 * films followed by a solid block of shows, and deduped because a title can
 * legitimately reach both sources.
 */
function buildWall(
  movies: MediaItem[],
  series: MediaItem[],
  tmdbMovies: string[],
  tmdbSeries: string[],
): string[] {
  const lists = [
    movies.map((m) => m.poster),
    series.map((m) => m.poster),
    tmdbMovies,
    tmdbSeries,
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  const longest = Math.max(...lists.map((l) => l.length));

  for (let i = 0; i < longest && out.length < 180; i++) {
    for (const list of lists) {
      const poster = list[i];
      if (!poster || seen.has(poster)) continue;
      seen.add(poster);
      out.push(poster);
    }
  }

  return out;
}
