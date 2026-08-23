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
    /*
       Authorship comes from TMDB first.

       The spread above puts Cinemeta second, so without these two lines its
       `director` silently overwrote TMDB's — and Cinemeta has no notion of a
       series creator, so a show would come back credited to whoever directed an
       episode. TMDB's value is the one that knows the difference between a film
       with two directors and a series with a creator, and it carries the label
       that says which it is.
    */
    director: tmdb?.director ?? cinemeta?.director,
    directorLabel: tmdb?.director ? tmdb.directorLabel : cinemeta?.directorLabel,
    /*
       The writing credit, TMDB first for the same reason as the director.

       Both providers can answer, and they answer differently: Cinemeta hands
       back IMDb's combined list, which folds the source material in with the
       screenwriters — Blade Runner comes back "Hampton Fancher, David Webb
       Peoples, Philip K. Dick", and Dick wrote the novel, not the script.
       TMDB files each writing credit under its own job, so `writingCredit` in
       tmdb.ts can take the screenplay and leave the novel; that also lets the
       heading say "Screenplay" rather than the vaguer "Writers".

       Deciding it the same way here as in `enrich` matters beyond accuracy:
       the details modal lets the list item override this payload, so a title
       opened from a rail already shows TMDB's credit. Preferring Cinemeta
       here made the same film read differently depending on whether it was
       opened from a rail or cold from the calendar.

       The label travels with whichever name won, so "Screenplay" is never
       printed over a list that came from the other provider.
    */
    writer: tmdb?.writer ?? cinemeta?.writer,
    writerLabel: tmdb?.writer ? tmdb.writerLabel : cinemeta?.writerLabel,
    /*
       Series totals. TMDB counts the whole run from its own season records;
       Cinemeta counts the episodes it happens to carry, which lags for a show
       still airing. So TMDB wins, and Cinemeta covers what TMDB can't match.
    */
    seasonCount: tmdb?.seasonCount ?? cinemeta?.seasonCount,
    episodeCount: tmdb?.episodeCount ?? cinemeta?.episodeCount,
    tmdbId: tmdbId ?? undefined,
    imdbId: imdbId ?? tmdb?.imdbId ?? cinemeta?.imdbId,
    trailerKey: cinemeta?.trailerKey ?? tmdb?.trailerKey,
    genres: cinemeta?.genres ?? tmdb?.genres,
    runtime: cinemeta?.runtime ?? tmdb?.runtime,
  };

  return Response.json(merged);
}
