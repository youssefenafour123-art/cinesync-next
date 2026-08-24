import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { fetchScores, hasOmdbKey } from "@/lib/omdb";
import { fetchReviews, findByImdbId } from "@/lib/tmdb";
import { fetchCriticalReception } from "@/lib/wikipedia";
import type { MediaKind, Scores } from "@/lib/types";

export const revalidate = 86400;

/**
 * Ratings and reviews for one title, from three sources kept clearly apart:
 *
 * - `rottenTomatoes` / `metacritic` / `imdb` — aggregate scores, from OMDb when
 *   a key is configured and otherwise from the film's Wikipedia article, which
 *   quotes both aggregators.
 * - `critics` — named press critics (Ebert, Kael, Dargis, Travers…) summarised
 *   from that article's "Critical response" section, credited to Wikipedia.
 * - `reviews` — written reviews by TMDB *members*.
 *
 * They stay in separate fields precisely so the UI can't present one as
 * another, which is what the legacy page did when it filled the critics rail
 * with invented "The Empire" and "New York Times" blurbs.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind: MediaKind = kindParam === "series" ? "series" : "movie";
  const tmdbParam = Number(url.searchParams.get("tmdb"));

  if (!id.startsWith("tt")) {
    return Response.json({ error: "An IMDb id is required" }, { status: 400 });
  }

  // Cinemeta items have no TMDB id, so resolve one to reach the reviews.
  let tmdbId = Number.isFinite(tmdbParam) && tmdbParam > 0 ? tmdbParam : null;
  let reviewKind = kind;
  if (!tmdbId) {
    const found = await findByImdbId(id);
    if (found) {
      tmdbId = found.tmdbId;
      reviewKind = found.kind;
    }
  }

  const [scores, reviews, reception] = await Promise.all([
    fetchScores(id),
    tmdbId ? fetchReviews(reviewKind, tmdbId) : Promise.resolve([]),
    fetchCriticalReception(id),
  ]);

  // OMDb is the fresher aggregate when it's configured, so it wins the score.
  // The review counts only ride along with a Wikipedia score — pairing OMDb's
  // percentage with Wikipedia's count would state a total the score isn't from.
  const rtFromWikipedia = !scores.rottenTomatoes && Boolean(reception?.rottenTomatoes);
  const mcFromWikipedia = !scores.metacritic && Boolean(reception?.metacritic);

  const payload: Scores & { omdbConfigured: boolean } = {
    ...scores,
    rottenTomatoes: scores.rottenTomatoes ?? reception?.rottenTomatoes,
    rottenTomatoesCount: rtFromWikipedia ? reception?.rottenTomatoesCount : undefined,
    metacritic: scores.metacritic ?? reception?.metacritic,
    metacriticCount: mcFromWikipedia ? reception?.metacriticCount : undefined,
    metacriticLabel: mcFromWikipedia ? reception?.metacriticLabel : undefined,
    consensus: reception?.consensus,
    critics: reception?.reviews ?? [],
    criticsSource: reception?.source,
    criticsSourceTitle: reception?.sourceTitle,
    reviews,
    omdbConfigured: hasOmdbKey(),
  };

  // Fired on every details-modal open. `revalidate` governs Next's data cache
  // but nothing at the edge, so without this each open paid the OMDb +
  // Wikipedia round trip again.
  return Response.json(payload, { headers: CATALOGUE_CACHE });
}
