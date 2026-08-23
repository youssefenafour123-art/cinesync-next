import "server-only";
import { TMDB_IMAGE, tmdbFetch, usReleaseDates } from "./tmdb";
import type { CalendarEntry, CalendarEpisode } from "./types";

/**
 * The release calendar.
 *
 * Films are the easy half: one `/discover/movie` window on `primary_release_date`
 * gives a dated list directly.
 *
 * Episodes are not. TMDB has no "what airs on this date" endpoint — the closest
 * thing, `/discover/tv` with an `air_date` window, returns *shows* that have an
 * episode somewhere in the range and tells you nothing about which episode or
 * which day. So each show is resolved in two more steps: fetch the show to find
 * which seasons could plausibly overlap the window, then fetch those seasons'
 * episode lists, which do carry a per-episode `air_date`.
 *
 * That is three requests per show, which is why the show list is capped. The
 * cap is a latency-and-quota decision, not an editorial one: every request in a
 * pass runs in parallel and the route is `revalidate: 3600`, so a month costs
 * about two seconds once an hour rather than per visitor.
 */

/** Shows resolved down to individual episodes per month. */
const MAX_SERIES = 14;
/** Season episode-lists fetched per show. */
const MAX_SEASONS_PER_SERIES = 2;
/**
 * Air dates kept per show per month.
 *
 * A weekly series drops four or five times a month and all of them belong on
 * the calendar. A daily one drops thirty, and thirty cells of the same show is
 * not a calendar. This bounds the pathological case without touching the normal
 * one.
 */
const MAX_DATES_PER_SERIES = 8;

/**
 * TMDB genre ids for news (10763), talk (10767), reality (10764) and soap
 * (10766).
 *
 * Excluded because "popular series with an episode this month" is dominated by
 * strip programming — a nightly news bulletin at S58E183, a daily reality show
 * at S13E136 — which is technically an episode drop and not what anyone opens a
 * release calendar to find. Without this filter they were more than half the
 * month; with it the same query returns Reacher, House of the Dragon, Silo and
 * Ted Lasso.
 */
const STRIP_PROGRAMMING = "10763,10767,10764,10766";

interface DiscoverMovie {
  id: number;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
}

interface DiscoverSeries {
  id: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
}

interface SeriesDetail {
  id: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  number_of_seasons?: number;
  seasons?: { season_number: number; air_date?: string | null; episode_count?: number }[];
  last_episode_to_air?: { season_number?: number } | null;
  next_episode_to_air?: { season_number?: number } | null;
  external_ids?: { imdb_id?: string | null };
}

interface SeasonDetail {
  season_number?: number;
  episodes?: {
    air_date?: string | null;
    episode_number?: number;
    season_number?: number;
    name?: string;
    overview?: string;
  }[];
}

/** First and last day of a `YYYY-MM` month, as ISO dates. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  // UTC throughout: `new Date(y, m, 0)` in a negative-offset timezone rolls the
  // last day of the month back into the previous one.
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return { first: first.toISOString().slice(0, 10), last: last.toISOString().slice(0, 10) };
}

/**
 * How far either side of the month to look for films.
 *
 * The largest primary-to-US gap seen in practice is nine days (Forgotten
 * Island, 16 to 25 September), so a fortnight covers it with room to spare
 * without dragging in a whole neighbouring month.
 */
const CATCH_MARGIN_DAYS = 14;

/** A `YYYY-MM-DD` moved by whole days, staying in UTC. */
function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM` for the current month, in the server's local reckoning. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** True for a well-formed `YYYY-MM` inside a range worth serving. */
export function isValidMonth(month: string | null): month is string {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  const year = Number(month.slice(0, 4));
  const thisYear = new Date().getFullYear();
  // TMDB has data well outside this, but an unbounded `month` parameter is an
  // invitation to walk the cache into oblivion one request at a time.
  return year >= thisYear - 5 && year <= thisYear + 5;
}

function movieEntries(raw: DiscoverMovie[], first: string, last: string): CalendarEntry[] {
  /*
     Deduplicated by TMDB id.

     The two `/discover/movie` pages are two separate requests against a
     `popularity.desc` ordering that TMDB recomputes between them, so a title
     sitting near the page boundary can come back on both — and did: "Spa
     Weekend" appeared twice on 20 August 2026, once per page. Two identical
     cards on the same day, and a duplicate React key for the pair.
  */
  const seen = new Set<number>();

  return raw
    .filter((m) => m.release_date && m.release_date >= first && m.release_date <= last)
    .filter((m) => m.poster_path)
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .map((m) => ({
      key: `movie-${m.id}`,
      tmdbId: m.id,
      title: m.title ?? "Untitled",
      kind: "movie" as const,
      poster: m.poster_path ? `${TMDB_IMAGE}/w342${m.poster_path}` : undefined,
      backdrop: m.backdrop_path ? `${TMDB_IMAGE}/w780${m.backdrop_path}` : undefined,
      date: m.release_date as string,
      rating: m.vote_average ? m.vote_average.toFixed(1) : undefined,
      overview: m.overview || undefined,
    }));
}

/**
 * Which seasons of a show could have episodes inside the window.
 *
 * Deliberately not `last_episode_to_air` alone: that points at *now*, so
 * browsing back to a month two years ago would resolve the wrong season and
 * report no episodes. Taking the most recent seasons that had already started
 * by the end of the window works in both directions.
 */
function candidateSeasons(detail: SeriesDetail, last: string): number[] {
  const started = (detail.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.air_date && s.air_date <= last)
    .sort((a, b) => (b.air_date ?? "").localeCompare(a.air_date ?? ""))
    .map((s) => s.season_number);

  // A season with no `air_date` on the season object still has dated episodes,
  // so the currently-airing season is worth including when nothing else matched.
  const airing = [
    detail.next_episode_to_air?.season_number,
    detail.last_episode_to_air?.season_number,
  ].filter((n): n is number => typeof n === "number");

  return [...new Set([...started, ...airing])].slice(0, MAX_SEASONS_PER_SERIES);
}

async function seriesEntries(
  raw: DiscoverSeries[],
  first: string,
  last: string,
): Promise<CalendarEntry[]> {
  const resolved = await Promise.all(
    raw.slice(0, MAX_SERIES).map(async (show) => {
      try {
        const detail = await tmdbFetch<SeriesDetail>(`/tv/${show.id}`, {
          append_to_response: "external_ids",
        });

        const seasons = candidateSeasons(detail, last);
        if (!seasons.length) return [];

        const seasonDetails = await Promise.all(
          seasons.map((n) =>
            tmdbFetch<SeasonDetail>(`/tv/${show.id}/season/${n}`, {}).catch(() => null),
          ),
        );

        // One entry per air date, carrying every episode that dropped that day.
        const byDate = new Map<string, CalendarEpisode[]>();

        for (const season of seasonDetails) {
          const episodes = season?.episodes ?? [];
          const total = episodes.length;

          for (const ep of episodes) {
            const date = ep.air_date;
            if (!date || date < first || date > last) continue;
            if (typeof ep.episode_number !== "number") continue;

            const seasonNumber = ep.season_number ?? season?.season_number ?? 0;
            const pad = (n: number) => String(n).padStart(2, "0");

            const list = byDate.get(date) ?? [];
            list.push({
              seasonNumber,
              episodeNumber: ep.episode_number,
              code: `S${pad(seasonNumber)}E${pad(ep.episode_number)}`,
              name: ep.name || `Episode ${ep.episode_number}`,
              isPremiere: ep.episode_number === 1,
              isFinale: total > 0 && ep.episode_number === total,
              overview: ep.overview || undefined,
            });
            byDate.set(date, list);
          }
        }

        return [...byDate.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(0, MAX_DATES_PER_SERIES)
          .map(([date, episodes]) => ({
            key: `tv-${show.id}-${date}`,
            tmdbId: show.id,
            imdbId: detail.external_ids?.imdb_id || undefined,
            title: detail.name ?? show.name ?? "Untitled",
            kind: "series" as const,
            poster: show.poster_path ? `${TMDB_IMAGE}/w342${show.poster_path}` : undefined,
            backdrop: show.backdrop_path ? `${TMDB_IMAGE}/w780${show.backdrop_path}` : undefined,
            date,
            rating: show.vote_average ? show.vote_average.toFixed(1) : undefined,
            overview: detail.overview || show.overview || undefined,
            episodes: episodes.sort((a, b) => a.episodeNumber - b.episodeNumber),
          }));
      } catch {
        // One unreachable show must not empty the whole month.
        return [];
      }
    }),
  );

  return resolved.flat();
}

/** Everything landing in one month, films and episode drops together. */
export async function fetchCalendar(month: string): Promise<CalendarEntry[]> {
  const { first, last } = monthBounds(month);

  /*
     Films are discovered over a wider window than the month they are kept for.

     `/discover/movie` can only be windowed on `primary_release_date`, which is
     the earliest release in any country — the calendar then re-dates each film
     to its announced American release, and the two differ by up to nine days
     in practice. Querying the month exactly would lose both ends of that: a
     film opening abroad on 30 December but in America on 2 January would be
     filtered out of December for being a January release, and January's own
     query would never find it, because its primary date is in December. It
     would simply cease to exist.

     Three pages rather than two, because a window half again as wide holds
     more films and the ordering is by popularity — without the extra page the
     titles gained at the edges would push mid-month ones off the end.
  */
  const catchFirst = shiftDays(first, -CATCH_MARGIN_DAYS);
  const catchLast = shiftDays(last, CATCH_MARGIN_DAYS);

  const [moviesA, moviesB, moviesC, series] = await Promise.all([
    tmdbFetch<{ results?: DiscoverMovie[] }>("/discover/movie", {
      "primary_release_date.gte": catchFirst,
      "primary_release_date.lte": catchLast,
      sort_by: "popularity.desc",
      include_adult: "false",
      page: "1",
    }),
    tmdbFetch<{ results?: DiscoverMovie[] }>("/discover/movie", {
      "primary_release_date.gte": catchFirst,
      "primary_release_date.lte": catchLast,
      sort_by: "popularity.desc",
      include_adult: "false",
      page: "2",
    }).catch(() => ({ results: [] as DiscoverMovie[] })),
    tmdbFetch<{ results?: DiscoverMovie[] }>("/discover/movie", {
      "primary_release_date.gte": catchFirst,
      "primary_release_date.lte": catchLast,
      sort_by: "popularity.desc",
      include_adult: "false",
      page: "3",
    }).catch(() => ({ results: [] as DiscoverMovie[] })),
    tmdbFetch<{ results?: DiscoverSeries[] }>("/discover/tv", {
      "air_date.gte": first,
      "air_date.lte": last,
      sort_by: "popularity.desc",
      include_adult: "false",
      without_genres: STRIP_PROGRAMMING,
      page: "1",
    }),
  ]);

  const candidates = movieEntries(
    [...(moviesA.results ?? []), ...(moviesB.results ?? []), ...(moviesC.results ?? [])],
    catchFirst,
    catchLast,
  );

  // Re-date to the announced American release, then keep what actually lands
  // in this month. Films with no US release keep the date they came with.
  const american = await usReleaseDates(candidates.map((c) => c.tmdbId));
  const movies = candidates
    .map((entry) => {
      const us = american.get(entry.tmdbId);
      return us && us !== entry.date ? { ...entry, date: us } : entry;
    })
    .filter((entry) => entry.date >= first && entry.date <= last);

  // Episodes are already dated by the air date TMDB gives per episode, which
  // is the broadcast itself rather than a country's window on a film.
  const episodes = await seriesEntries(series.results ?? [], first, last);

  return [...movies, ...episodes].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}
