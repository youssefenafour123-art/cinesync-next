import "server-only";
import type { Awards, Scores } from "./types";

/**
 * Rotten Tomatoes / Metacritic / IMDb scores — and awards — via OMDb.
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
  Awards?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: { Source?: string; Value?: string }[];
}

export function hasOmdbKey(): boolean {
  return Boolean(API_KEY);
}

/**
 * OMDb's headline award, if it named one.
 *
 * "Won 7 Oscars." / "Nominated for 1 Primetime Emmy." — a verb, a count and
 * the body's name, terminated by the full stop that separates it from the
 * totals. Anchored at the start so it cannot match inside the totals clause,
 * and the body is `[^.]` so "Won 1 Oscar. 45 wins" cannot swallow the tail.
 */
const HEADLINE = /^(Won|Nominated for) (\d+) ([A-Za-z][^.]*?)\./;

/** "396 wins" / "1 win", wherever it appears in the totals clause. */
const WINS = /(\d[\d,]*) wins?\b/;

/** "655 nominations" / "1 nomination". */
const NOMINATIONS = /(\d[\d,]*) nominations?\b/;

function count(match: RegExpMatchArray | null): number {
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

/**
 * OMDb's `Awards` line, turned into something a badge can render.
 *
 * Exported for the sake of being testable against the strings above; nothing
 * else imports it.
 *
 * The headline is preferred because it is the answer to the question people
 * are actually asking — "did this win anything that matters" — and OMDb has
 * already decided which body counts as major. Falling back to the totals means
 * a title with real wins at festivals or guilds still says so, quietly, rather
 * than showing nothing because no Academy was involved.
 *
 * A line that reports only nominations never comes back as `won`. That is the
 * whole reason this is parsed rather than printed: "Nominated for 7 Oscars" is
 * Shawshank, and a badge reading "7 Oscars" over it would be a lie about the
 * most famous loss in the Academy's history.
 */
export function parseAwards(raw?: string): Awards | undefined {
  const detail = raw?.trim();
  if (!detail || detail === "N/A") return undefined;

  const headline = HEADLINE.exec(detail);
  if (headline) {
    const [, verb, howMany, body] = headline;
    return {
      label: `${verb === "Won" ? "Won" : "Nominated for"} ${howMany} ${body}`,
      won: verb === "Won",
      headline: true,
      detail,
    };
  }

  const wins = count(WINS.exec(detail));
  if (wins > 0) {
    return {
      label: `${wins.toLocaleString("en-US")} ${wins === 1 ? "win" : "wins"}`,
      won: true,
      headline: false,
      detail,
    };
  }

  const nominations = count(NOMINATIONS.exec(detail));
  if (nominations > 0) {
    return {
      label: `${nominations.toLocaleString("en-US")} ${nominations === 1 ? "nomination" : "nominations"}`,
      won: false,
      headline: false,
      detail,
    };
  }

  return undefined;
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
      awards: parseAwards(clean(data.Awards)),
    };
  } catch {
    return {};
  }
}
