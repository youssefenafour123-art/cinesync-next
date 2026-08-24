import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { fetchTopCatalog } from "@/lib/cinemeta";
import { posterWall, withCommunityPosters } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";
import type { DiscoverPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { DiscoverPayload };

export async function GET() {
  const [movies, series, tmdbMovies, tmdbSeries] = await Promise.all([
    fetchTopCatalog("movie"),
    fetchTopCatalog("series"),
    /*
       Cinemeta's top catalog caps at 50 per kind, which barely covers the
       wall's own grid and leaves nothing for it to cross-fade in. TMDB tops
       the pool up with poster URLs only — no per-title enrichment.

       Both are caught, because this route is the one place a TMDB failure was
       fatal rather than merely visible. `posterWall` throws on any non-OK
       response — `fetchTopCatalog` swallows its own errors and the sibling
       routes wrap theirs — and this route is prerendered at build time, so a
       rate-limited or unreachable TMDB during a deploy failed the *build*, not
       just the request. The wall is decoration behind a scrim; it is not worth
       a red deploy.
    */
    posterWall("movie").catch(() => [] as string[]),
    posterWall("tv").catch(() => [] as string[]),
  ]);

  // Interleave films and shows so the slider isn't six movies in a row.
  const hero: MediaItem[] = [];
  for (let i = 0; i < 4; i++) {
    if (movies[i]) hero.push(movies[i]);
    if (series[i]) hero.push(series[i]);
  }

  /*
     Community artwork for the three things a visitor actually looks at.

     Cinemeta hands back metahub posters — one fixed image per IMDb id, the
     same one inside every Stremio install — so without this the landing tab is
     the most generically illustrated part of the app. `withCommunityPosters`
     swallows its own failures per title, and the wall is deliberately left on
     metahub: it is 180 blurred tiles behind a scrim, and upgrading it would
     cost 360 requests to change something nobody can resolve.
  */
  const [heroArt, movieArt, seriesArt] = await Promise.all([
    withCommunityPosters(hero.filter((h) => h.backdrop || h.poster).slice(0, 6)),
    withCommunityPosters(movies.slice(0, 18)),
    withCommunityPosters(series.slice(0, 18)),
  ]);

  const payload: DiscoverPayload = {
    hero: heroArt,
    rails: [
      { title: "Most Watched Movies", items: movieArt },
      { title: "Most Watched Series", items: seriesArt },
    ],
    wall: buildWall(movies, series, tmdbMovies, tmdbSeries),
  };

  return Response.json(payload, { headers: CATALOGUE_CACHE });
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
