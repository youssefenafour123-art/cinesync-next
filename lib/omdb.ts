import "server-only";
import type { Scores } from "./types";

/**
 * Rotten Tomatoes / Metacritic / IMDb scores via OMDb.
 *
 * OMDb is the only free source that legitimately redistributes RT and
 * Metacritic numbers — both of those sites forbid scraping, and no free API
 * carries written reviews from named press critics. So this supplies the
 * *scores*, properly attributed, and `tmdb.ts` supplies written community
 * reviews. Nothing here is presented as a press review.
 *
 * Without OMDB_API_KEY the app still works; the RT/Metacritic rows are simply
 * absent. Get a free key at https://www.omdbapi.com/apikey.aspx (1000/day).
 */

const API_KEY = process.env.OMDB_API_KEY?.trim();

interface OmdbResponse {
  Response?: string;
  Error?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: { Source?: string; Value?: string }[];
}

export function hasOmdbKey(): boolean {
  return Boolean(API_KEY);
}

/** Returns partial scores; never throws, since this is decoration on a modal. */
export async function fetchScores(imdbId: string): Promise<Partial<Scores>> {
  if (!API_KEY || !imdbId.startsWith("tt")) return {};

  try {
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("apikey", API_KEY);
    url.searchParams.set("i", imdbId);
    url.searchParams.set("tomatoes", "true");

    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return {};

    const data = (await res.json()) as OmdbResponse;
    if (data.Response === "False") return {};

    const ratings = data.Ratings ?? [];
    const rt = ratings.find((r) => r.Source === "Rotten Tomatoes")?.Value;

    // OMDb returns the literal string "N/A" rather than omitting fields.
    const clean = (v?: string) => (v && v !== "N/A" ? v : undefined);

    const metascore = clean(data.Metascore);
    const imdbRating = clean(data.imdbRating);

    return {
      imdb: imdbRating ? { value: imdbRating, votes: clean(data.imdbVotes) } : undefined,
      rottenTomatoes: clean(rt),
      metacritic: metascore ? `${metascore}/100` : undefined,
    };
  } catch {
    return {};
  }
}
