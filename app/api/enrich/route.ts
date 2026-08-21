import { fetchMeta } from "@/lib/cinemeta";
import { enrichById, findByImdbId } from "@/lib/tmdb";
import type { MediaItem, MediaKind } from "@/lib/types";

export const revalidate = 3600;

/**
 * Full detail for one title, merged from both providers.
 *
 * Cinemeta gives the best plot and IMDb rating; TMDB gives credits with person
 * ids, which is what makes the cast and director clickable. Items reaching the
 * details modal can come from either source, so this resolves whichever id is
 * missing and combines the two.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const imdbId = url.searchParams.get("imdb");
  const tmdbParam = Number(url.searchParams.get("tmdb"));
  const kind: MediaKind = url.searchParams.get("kind") === "series" ? "series" : "movie";

  if (!imdbId && !Number.isFinite(tmdbParam)) {
    return Response.json({ error: "An imdb or tmdb id is required" }, { status: 400 });
  }

  let tmdbId = Number.isFinite(tmdbParam) && tmdbParam > 0 ? tmdbParam : null;
  let tmdbKind = kind;

  if (!tmdbId && imdbId) {
    const found = await findByImdbId(imdbId);
    if (found) {
      tmdbId = found.tmdbId;
      tmdbKind = found.kind;
    }
  }

  const [cinemeta, tmdb] = await Promise.all([
    imdbId ? fetchMeta(kind, imdbId) : Promise.resolve(null),
    tmdbId ? enrichById(tmdbId, tmdbKind) : Promise.resolve(null),
  ]);

  if (!cinemeta && !tmdb) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // TMDB wins on credits and artwork; Cinemeta wins on plot and IMDb rating.
  const merged: MediaItem = {
    ...(tmdb ?? ({} as MediaItem)),
    ...(cinemeta ?? ({} as MediaItem)),
    people: tmdb?.people ?? cinemeta?.people,
    tmdbId: tmdbId ?? undefined,
    imdbId: imdbId ?? tmdb?.imdbId ?? cinemeta?.imdbId,
    trailerKey: cinemeta?.trailerKey ?? tmdb?.trailerKey,
    genres: cinemeta?.genres ?? tmdb?.genres,
    runtime: cinemeta?.runtime ?? tmdb?.runtime,
  };

  return Response.json(merged);
}
