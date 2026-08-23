import "server-only";
import { curate } from "./tmdb";
import { existsInCinemeta } from "./cinemeta";
import type { MediaItem, MediaKind, Rail } from "./types";
// The filter shapes cross the wire in `ArabicPayload`, so they live in the
// shared package with the rest of the API contract and are re-exported here.
import type { ArabicCountry, ArabicGenre } from "@cinesync/shared/payloads";
export type { ArabicCountry, ArabicGenre };

/**
 * Arabic cinema and television.
 *
 * Two decisions shape everything in this file.
 *
 * **Language first, country second.** `with_origin_country` alone is both too
 * narrow and too loose: it returns 40 Moroccan films, and among them Italian
 * productions that merely shot in Morocco. Pairing it with
 * `with_original_language=ar` fixes both ends — the Moroccan pool grows to 521
 * and the Italian comedies drop out, because what makes a film Moroccan cinema
 * here is that it is in Arabic *and* from Morocco. "All" is the language filter
 * on its own, which is the only way titles from co-productions and the wider
 * region are not silently excluded.
 *
 * **Every title is checked against Stremio.** The rails exist so someone can
 * press "Add to Library" and then find the thing in Stremio. That means a TMDB
 * id is not enough: the title needs an IMDb id, and Cinemeta — the catalogue
 * Stremio resolves library rows through — has to carry it. Anything failing
 * either test is dropped rather than shown as a row that cannot be opened.
 *
 * The thresholds are far below the ones the English-language rails use, and
 * deliberately so. The most-voted Arabic series on TMDB has ~555 votes and most
 * sit under 60, against `curate`'s default of 500. Applying the site-wide floor
 * here would return an empty tab — not because the films are bad, but because
 * TMDB's voting population is overwhelmingly Western.
 */


/**
 * The four the brief named come first; the rest complete the region so "All"
 * isn't a promise the country chips can't keep.
 */
export const ARABIC_COUNTRIES: ArabicCountry[] = [
  { id: "all", label: "All Arabic", arabic: "كل الأفلام العربية" },
  { id: "EG", label: "Egypt", arabic: "مصر" },
  { id: "MA", label: "Morocco", arabic: "المغرب" },
  { id: "LB", label: "Lebanon", arabic: "لبنان" },
  { id: "SY", label: "Syria", arabic: "سوريا" },
  { id: "PS", label: "Palestine", arabic: "فلسطين" },
  { id: "JO", label: "Jordan", arabic: "الأردن" },
  { id: "TN", label: "Tunisia", arabic: "تونس" },
  { id: "DZ", label: "Algeria", arabic: "الجزائر" },
  { id: "IQ", label: "Iraq", arabic: "العراق" },
  { id: "SA", label: "Saudi Arabia", arabic: "السعودية" },
  { id: "KW", label: "Kuwait", arabic: "الكويت" },
];


/**
 * TMDB genre ids. Movie and TV use separate genre vocabularies, so the ones
 * that differ carry both — Action is 28 for film and 10759 ("Action &
 * Adventure") for television, and passing the film id to a TV query silently
 * returns nothing rather than erroring.
 */
const GENRES: (ArabicGenre & { movieId?: string; tvId?: string })[] = [
  { id: "all", label: "All Genres" },
  { id: "drama", label: "Drama", movieId: "18", tvId: "18" },
  { id: "comedy", label: "Comedy", movieId: "35", tvId: "35" },
  { id: "romance", label: "Romance", movieId: "10749", tvId: "10749" },
  { id: "thriller", label: "Thriller", movieId: "53", tvId: "9648" },
  { id: "action", label: "Action", movieId: "28", tvId: "10759" },
  { id: "crime", label: "Crime", movieId: "80", tvId: "80" },
  { id: "history", label: "History", movieId: "36", tvId: "10768" },
  { id: "war", label: "War", movieId: "10752", tvId: "10768" },
  { id: "documentary", label: "Documentary", movieId: "99", tvId: "99" },
  { id: "family", label: "Family", movieId: "10751", tvId: "10751" },
  { id: "horror", label: "Horror", movieId: "27", tvId: "9648" },
  { id: "mystery", label: "Mystery", movieId: "9648", tvId: "9648" },
];

export const ARABIC_GENRES: ArabicGenre[] = GENRES.map((g) => ({ id: g.id, label: g.label }));

export function findCountry(id: string): ArabicCountry | undefined {
  return ARABIC_COUNTRIES.find((c) => c.id === id);
}

export function findGenre(id: string) {
  return GENRES.find((g) => g.id === id);
}

/**
 * Drops anything that would land in a Stremio library as an unopenable row.
 *
 * The Cinemeta lookups run in parallel and are cached for a day, so this costs
 * one extra round of cheap requests per rail rather than one per render.
 */
async function keepOnlyStremioPlayable(items: MediaItem[], kind: MediaKind): Promise<MediaItem[]> {
  const withImdb = items.filter((item) => item.imdbId);
  const available = await Promise.all(
    withImdb.map((item) => existsInCinemeta(kind, item.imdbId as string)),
  );
  return withImdb.filter((_, i) => available[i]);
}

interface RailRequest {
  countryId: string;
  genreId: string;
  kind: MediaKind;
  limit?: number;
}

/**
 * One rail of Arabic titles, ranked by weighted rating and guaranteed
 * addable to a Stremio library.
 */
export async function arabicRail({
  countryId,
  genreId,
  kind,
  limit = 12,
}: RailRequest): Promise<MediaItem[]> {
  const endpoint = kind === "movie" ? "movie" : "tv";
  const country = findCountry(countryId);
  const genre = findGenre(genreId);

  const params: Record<string, string> = {
    with_original_language: "ar",
    sort_by: "vote_count.desc",
    /*
      Three, not ten.

      Ten looks like the responsible number and is the wrong one here: it is
      what makes the smaller catalogues collapse. Syria goes from 3 films and 1
      series at ten votes to 23 and 16 at three; Morocco's television goes from
      nothing at all to something. The pool is not thin, TMDB's Arabic voter
      base is.

      The usual objection — that a three-vote average is three people's opinion
      — is already answered by the weighted rating below. A title with three
      votes is pulled ~89% of the way to the pool mean at `minVotes: 25`, so it
      sorts mid-pack rather than topping the rail off the back of one
      enthusiast. Which is the right outcome: present, but not presented as
      acclaimed.
    */
    "vote_count.gte": "3",
    include_adult: "false",
  };

  if (country && country.id !== "all") params.with_origin_country = country.id;

  const genreParam = endpoint === "movie" ? genre?.movieId : genre?.tvId;
  if (genreParam) params.with_genres = genreParam;

  const items = await curate(endpoint, params, {
    // Tuned for a catalogue TMDB's voters have barely touched. `minVotes` is the
    // point at which a title's own average is trusted over the pool mean; at the
    // site-wide 500 every Arabic title would be dragged to the mean and the
    // ranking would collapse into "whatever has the most votes".
    minVotes: 25,
    floor: 5.4,
    // The IMDb floor is lower still, because Arabic titles carry thin IMDb vote
    // counts too and a hard 6.5 empties the smaller countries entirely.
    postFloor: 5.0,
    limit,
    pages: 2,
    // Almost nothing is discarded by a 5.0 floor, so enriching twice the rail
    // length would be ~24 wasted pairs of requests per rail.
    shortlist: limit + 8,
  });

  return keepOnlyStremioPlayable(items, kind);
}

/** Both rails for a country/genre selection, fetched together. */
export async function arabicRails(countryId: string, genreId: string): Promise<Rail[]> {
  const country = findCountry(countryId) ?? ARABIC_COUNTRIES[0];
  const genre = findGenre(genreId) ?? GENRES[0];

  const [films, series] = await Promise.all([
    arabicRail({ countryId: country.id, genreId: genre.id, kind: "movie" }),
    arabicRail({ countryId: country.id, genreId: genre.id, kind: "series" }),
  ]);

  const where = country.id === "all" ? "Arabic" : country.label;
  const what = genre.id === "all" ? "" : ` ${genre.label}`;

  return [
    {
      title: `${where}${what} Films`,
      blurb:
        country.id === "all"
          ? "Arabic-language cinema, ranked by weighted rating. Every title here resolves in Stremio."
          : `Arabic-language cinema from ${country.label}, ranked by weighted rating.`,
      items: films,
    },
    {
      title: `${where}${what} Series`,
      blurb:
        country.id === "all"
          ? "Arabic-language television, from Ramadan drama to streaming originals."
          : `Arabic-language television from ${country.label}.`,
      items: series,
    },
  ];
}
