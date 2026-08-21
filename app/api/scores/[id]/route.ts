import { fetchScores, hasOmdbKey } from "@/lib/omdb";
import { fetchReviews, findByImdbId } from "@/lib/tmdb";
import type { MediaKind, Scores } from "@/lib/types";

export const revalidate = 86400;

/**
 * Ratings and reviews for one title.
 *
 * Aggregate scores (Rotten Tomatoes, Metacritic, IMDb) come from OMDb and are
 * attributed to their sources. Written reviews come from TMDB and are
 * community reviews — the response keeps them in a separate field precisely so
 * the UI can't present them as press criticism, which is what the legacy page
 * did with invented "The Empire" and "New York Times" blurbs.
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

  const [scores, reviews] = await Promise.all([
    fetchScores(id),
    tmdbId ? fetchReviews(reviewKind, tmdbId) : Promise.resolve([]),
  ]);

  const payload: Scores & { omdbConfigured: boolean } = {
    ...scores,
    reviews,
    omdbConfigured: hasOmdbKey(),
  };

  return Response.json(payload);
}
