import "server-only";
import { fetchImdbRating } from "./cinemeta";
import type {
  CreditedPerson,
  MediaItem,
  MediaKind,
  Person,
  PersonCredit,
  SearchResults,
} from "./types";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

/**
 * The legacy app hardcoded this key in index.html. It stays as the fallback so
 * the app runs with zero setup, but TMDB_API_KEY in .env.local wins — and
 * because every TMDB call happens here on the server, the key never ships to
 * the browser either way.
 */
const API_KEY = process.env.TMDB_API_KEY || "4e44d9029b1270a757cddc766a1bcb63";

export interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  profile_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  genre_ids?: number[];
  media_type?: string;
  known_for_department?: string;
  known_for?: { title?: string; name?: string }[];
  character?: string;
  job?: string;
  department?: string;
  credit_id?: string;
}

interface TmdbPoster {
  iso_639_1: string | null;
  file_path: string;
  vote_average: number;
  vote_count?: number;
  width?: number;
  aspect_ratio?: number;
}

interface TmdbDetail {
  runtime?: number;
  /** Series only. The people who actually created the show. */
  created_by?: { id?: number; name?: string; profile_path?: string | null }[];
  episode_run_time?: number[];
  /** Series only. TMDB's own totals — the whole run, not the current season. */
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id?: number; name: string }[];
  credits?: {
    crew?: {
      id?: number;
      job?: string;
      department?: string;
      name?: string;
      profile_path?: string | null;
    }[];
    cast?: { id?: number; name?: string; character?: string; profile_path?: string | null }[];
  };
  videos?: { results?: { site?: string; type?: string; key?: string }[] };
  /** Movies only. One entry per country that has an announced release. */
  release_dates?: {
    results?: {
      iso_3166_1?: string;
      release_dates?: { release_date?: string; type?: number }[];
    }[];
  };
  /** "Released", "Post Production", "Planned", "Rumored", … */
  status?: string;
  images?: { posters?: TmdbPoster[] };
  external_ids?: { imdb_id?: string | null };
}

async function tmdb<T>(path: string, params: Record<string, string> = {}, revalidate = 3600) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The raw request helper, exposed for `lib/calendar.ts`.
 *
 * The calendar needs endpoints nothing else here touches — season episode
 * lists, air-date discovery windows — and reimplementing the key handling and
 * revalidation in a second file is how the two drift apart.
 */
export { tmdb as tmdbFetch };

/** TMDB's image CDN root, so callers can build their own poster/still URLs. */
export const TMDB_IMAGE = IMG;

export function isoDate(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toISOString().split("T")[0];
}

/**
 * The US release date for a film, which is the one people mean.
 *
 * TMDB's top-level `release_date` is the *earliest* release anywhere, and for
 * a wide international opening that is rarely the American one. Avengers:
 * Doomsday carries 2026-12-16 there — Austria and France — while the US and UK
 * open on the 18th. Printing the 16th was not a rounding error; it was another
 * country's date.
 *
 * Types are ranked rather than taken first-found, because a country can list
 * several. Theatrical is the release; a limited run is the next best answer; a
 * digital date is the real one for a film that never sees a cinema.
 *
 * Festival premieres (type 1) are discarded outright rather than ranked last.
 * Ranking was not enough: a film whose *only* American entry is a premiere
 * still fell through to it, and those run months ahead — Dark Horse premieres
 * in June 2026 and releases in November, Censurada premieres a full year
 * early. On a release calendar that is not a near miss, it is the wrong month
 * entirely, so such a film keeps its own date instead.
 *
 * Earliest wins within a type: a second entry of the same kind is usually a
 * re-release or a regional stagger.
 */
const US_RELEASE_PREFERENCE = [3, 2, 4, 6, 5];
/** TMDB release type 1. A screening, not a release. */
const PREMIERE = 1;

/**
 * How long after its first American date a film is still having the same
 * release. Theatrical, then digital, then physical — a year and a half is
 * generous for that run and nowhere near a repertory re-release.
 */
const RELEASE_RUN_DAYS = 548;

/**
 * How far a film's first American date may sit behind its world premiere
 * before the American record stops being about the same event. Five years is
 * past any distribution deal and into rediscovery.
 */
const REDISCOVERY_DAYS = 1825;

/**
 * The American release, ignoring later re-releases.
 *
 * The type ranking alone got this badly wrong, because "earliest wins" only
 * applied *within* a type: a late Theatrical entry beat an early Limited one.
 * A film with no original American theatrical run — most classics, most anime
 * — has exactly one type-3 entry, the modern repertory booking, so The End of
 * Evangelion (1997) was dated **2026** and Spirited Away (2001) **2025**, on
 * cards, in the details panel and on the calendar. "Under the Radar", a rail
 * that admits nothing from the last three years, was showing a film from 1997
 * labelled next year: the rail filters on `primary_release_date` at the
 * `/discover` step and the relabelling happens here, afterwards.
 *
 * So the American entries are first narrowed to one release: those within
 * `RELEASE_RUN_DAYS` of the earliest of them. The ranking then runs unchanged
 * over that window.
 *
 * And when even the earliest American entry postdates the world premiere by
 * `REDISCOVERY_DAYS`, the whole American record is a later rediscovery rather
 * than this film's release, and the caller is better served by the primary
 * date it already has — End of Evangelion's first American entry is a 2002
 * DVD, five years after Japan.
 *
 * The two rules are deliberately separate. Measuring the window from the
 * earliest *American* date rather than from the premiere is what protects a
 * genuinely late first opening: Ikiru reached America in 1956 and Seven
 * Samurai in 1956, three and four years out, which was ordinary for Japanese
 * cinema then and is the date this app means to show.
 */
function usReleaseDate(
  results: TmdbDetail["release_dates"],
  primaryDate?: string,
): string | undefined {
  const us = (results?.results ?? []).find((r) => r.iso_3166_1 === "US");
  if (!us?.release_dates?.length) return undefined;

  const dated = us.release_dates
    .map((r) => ({ date: (r.release_date ?? "").slice(0, 10), type: r.type ?? 0 }))
    .filter((r) => r.date && r.type !== PREMIERE);
  if (!dated.length) return undefined;

  const earliest = dated.reduce((a, b) => (a.date <= b.date ? a : b)).date;

  if (primaryDate) {
    const behind = dayGap(earliest, primaryDate);
    if (Number.isFinite(behind) && behind > REDISCOVERY_DAYS) return undefined;
  }

  const run = dated.filter((r) => {
    const gap = dayGap(r.date, earliest);
    return !Number.isFinite(gap) || gap <= RELEASE_RUN_DAYS;
  });

  for (const type of US_RELEASE_PREFERENCE) {
    const matches = run.filter((r) => r.type === type).sort((a, b) => a.date.localeCompare(b.date));
    if (matches.length) return matches[0].date;
  }

  return run.sort((a, b) => a.date.localeCompare(b.date))[0].date;
}

/*
   One append string for both film lookups, so they are one request.

   The calendar asks for a film's US release date and, moments later, for its
   artwork. Those were two calls to the same endpoint differing only in
   `append_to_response`, which makes two cache keys and two round trips per
   film — the calendar measured 7.9s cold. Requesting the same URL from both
   means Next's data cache serves the second, and neither caller pays for
   what the other already fetched.
*/
const MOVIE_APPEND = "images,release_dates";

/**
 * Announced US release dates for a batch of films, keyed by TMDB id.
 *
 * Exposed for `lib/calendar.ts`, which builds from `/discover/movie` and so
 * only ever sees `primary_release_date` — the earliest release in any country.
 * Without this the calendar sat a film on another country's opening while the
 * details panel, which enriches properly, printed the American one.
 *
 * A film with no announced US release is simply absent from the map; the
 * caller keeps whatever date it had.
 */
export async function usReleaseDates(ids: number[]): Promise<Map<number, string>> {
  const found = new Map<number, string>();

  await mapLimit(ids, 8, async (id) => {
    try {
      // `TmdbListItem` for `release_date`: `usReleaseDate` needs the primary
      // date to tell a release from a re-release.
      const detail = await tmdb<TmdbDetail & TmdbListItem>(
        `/movie/${id}`,
        { append_to_response: MOVIE_APPEND },
        86400,
      );
      const us = usReleaseDate(detail.release_dates, detail.release_date);
      if (us) found.set(id, us);
    } catch {
      // Keep the discover date rather than dropping the film.
    }
  });

  return found;
}

/** Whole days between two `YYYY-MM-DD` dates; NaN if either is unparseable. */
function dayGap(a: string, b: string): number {
  const ms = Date.parse(a) - Date.parse(b);
  return Number.isNaN(ms) ? Number.NaN : Math.round(ms / 86_400_000);
}

function formatDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function baseItem(raw: TmdbListItem, kind: MediaKind): MediaItem {
  const date = raw.release_date || raw.first_air_date;
  return {
    key: `tmdb:${raw.id}`,
    tmdbId: raw.id,
    title: raw.title || raw.name || "Untitled",
    kind,
    poster: raw.poster_path ? `${IMG}/w500${raw.poster_path}` : undefined,
    /*
       `w1280`, not `original`.

       TMDB's `original` backdrops are commonly 3840x2160 and one to four
       megabytes each, and they are displayed on a 70vh hero — and
       `HeroCarousel` keeps every slide mounted (`opacity: 0`, not
       `display: none`), so the tracker downloaded five of them at once. 1280
       is wider than the element is ever rendered on a 1440 viewport once the
       hero's own scrim and content are over it.
    */
    backdrop: raw.backdrop_path ? `${IMG}/w1280${raw.backdrop_path}` : undefined,
    year: date ? date.slice(0, 4) : undefined,
    releaseDate: formatDate(date) ?? "TBA",
    releaseIso: date || undefined,
    rating: raw.vote_average ? raw.vote_average.toFixed(1) : undefined,
    voteCount: raw.vote_count,
    description: raw.overview || undefined,
  };
}

/**
 * The writing credit, in the order the industry itself ranks them.
 *
 * TMDB files the whole writing department under one `department: "Writing"`
 * and half a dozen job titles, and they do not mean the same thing. "Story"
 * is who had the idea, "Novel" / "Characters" / "Comic Book" are the source
 * material and belong to a book nobody wrote for the screen, and only
 * "Screenplay" / "Teleplay" / "Writer" are the credit a viewer means when
 * they ask who wrote it. Flattening all of them into one line is how Blade
 * Runner ends up "written by" Philip K. Dick, who died before it was cut.
 *
 * So: take the highest-ranked job actually present and list only the people
 * holding *that* job. A film with a screenplay credit shows its screenwriters
 * and not its novelist; a film credited only as "Writer" still shows someone.
 *
 * `job` is also matched against the department, because "Writer" appears in
 * the Sound department too — a staff writer on a documentary is not the
 * screenwriter, and TMDB will hand you both under the same job title.
 */
const WRITING_JOBS = ["Screenplay", "Teleplay", "Writer", "Story"] as const;

function writingCredit(
  crew: { job?: string; department?: string; name?: string }[],
): { writer: string; writerLabel: string } | null {
  for (const job of WRITING_JOBS) {
    const names = [
      ...new Set(
        crew
          .filter(
            (c) =>
              c.job === job &&
              c.name &&
              (c.department === "Writing" || c.department === undefined),
          )
          .map((c) => c.name as string),
      ),
    ];
    if (!names.length) continue;

    // "Screenplay" and "Teleplay" are the credit's own name and read wrong
    // pluralised — two people still wrote one screenplay.
    const label =
      job === "Writer" ? (names.length > 1 ? "Writers" : "Writer") : job === "Story" ? "Story" : job;
    return { writer: names.join(", "), writerLabel: label };
  }
  return null;
}

/**
 * Adds director, top cast, trailer key, IMDb id, genres, runtime and — where
 * one exists — the artistic textless poster, matching the legacy enrichment.
 * Failures degrade to the un-enriched item rather than throwing.
 */
async function enrich(raw: TmdbListItem, kind: MediaKind): Promise<MediaItem> {
  const item = baseItem(raw, kind);
  const endpoint = kind === "movie" ? "movie" : "tv";

  try {
    const detail = await tmdb<TmdbDetail>(`/${endpoint}/${raw.id}`, {
      // No `include_image_language`: TMDB then returns every language, and
      // `rankCommunityPosters` keeps the ones this title may wear.
      //
      // `release_dates` is a movie-only append and says whether a date has
      // actually been announced anywhere — see `releaseConfirmed` below.
      append_to_response:
        endpoint === "movie"
          ? "credits,videos,images,external_ids,release_dates"
          : "credits,videos,images,external_ids",
    });

    const crew = detail.credits?.crew ?? [];
    const castList = detail.credits?.cast ?? [];

    /*
       Who made this, accurately.

       The old line was `crew.find(job === "Director") ?? crew.find(job ===
       "Executive Producer")`, and both halves of it were wrong.

       For a series, TMDB's series-level crew almost never contains a Director —
       episodes have directors, shows do not — so it fell through to the
       Executive Producer *and displayed them under a "Director" heading*.
       Breaking Bad was credited to Michelle MacLaren rather than Vince
       Gilligan, Game of Thrones to David Nutter rather than Benioff and Weiss,
       Chernobyl to Carolyn Strauss rather than Craig Mazin, The Wire to Nina K.
       Noble rather than David Simon. Every one of those is a real person who
       worked on the show and did not do the job the label claimed. `created_by`
       is the field that answers this question for television.

       For a film, `find` returned the first of several directors, so
       co-directed work lost half its authorship: "Daniel Scheinert" for
       Everything Everywhere All at Once, "Lana Wachowski" for The Matrix,
       "Anthony Russo" for Endgame, "Joel Coen" for No Country for Old Men.

       `directorLabel` travels with the name so the UI can say "Creator",
       "Directors" or "Director" instead of assuming.
    */
    if (kind === "series") {
      const creators = (detail.created_by ?? []).map((c) => c.name).filter(Boolean) as string[];
      if (creators.length) {
        item.director = creators.join(", ");
        item.directorLabel = creators.length > 1 ? "Creators" : "Creator";
      }
    } else {
      const directors = crew
        .filter((c) => c.job === "Director" && c.name)
        .map((c) => c.name as string);
      // Dedupe: TMDB lists someone twice when they are credited in two
      // departments, and "Joel Coen, Joel Coen" is its own kind of wrong.
      const unique = [...new Set(directors)];
      if (unique.length) {
        item.director = unique.join(", ");
        item.directorLabel = unique.length > 1 ? "Directors" : "Director";
      }
    }
    /*
       The writing credit is a separate question from the directing one.

       For a series this is usually empty at the show level — television
       credits writers per episode — which is why `created_by` still carries
       the authorship there and this only fills in when TMDB has a
       series-level writing credit to give.
    */
    const writing = writingCredit(crew);
    if (writing) {
      item.writer = writing.writer;
      item.writerLabel = writing.writerLabel;
    }

    // Series totals. `number_of_episodes` counts the whole run across every
    // season, which is the number people mean by "how long is this show".
    if (kind === "series") {
      if (detail.number_of_seasons) item.seasonCount = detail.number_of_seasons;
      if (detail.number_of_episodes) item.episodeCount = detail.number_of_episodes;
    }

    item.cast = castList.slice(0, 3).map((c) => c.name).filter(Boolean).join(", ") || undefined;

    // Keep ids alongside names so the details modal can open a profile.
    // Directors and writers first — they're what people look up.
    const KEY_CREW = /^(Director|Screenplay|Teleplay|Writer|Story|Creator)$/;
    const seenPeople = new Set<number>();
    const people: CreditedPerson[] = [];

    // Series creators are not in `credits.crew`, so they have to be added by
    // hand or the person whose show it is isn't clickable on their own show.
    for (const c of detail.created_by ?? []) {
      if (!c.id || !c.name || seenPeople.has(c.id)) continue;
      seenPeople.add(c.id);
      people.push({
        tmdbId: c.id,
        name: c.name,
        role: "Creator",
        profile: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined,
        isCrew: true,
      });
    }

    for (const c of crew) {
      if (!c.id || !c.name || !KEY_CREW.test(c.job ?? "") || seenPeople.has(c.id)) continue;
      seenPeople.add(c.id);
      people.push({
        tmdbId: c.id,
        name: c.name,
        role: c.job ?? "Crew",
        profile: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined,
        isCrew: true,
      });
    }

    for (const c of castList.slice(0, 12)) {
      if (!c.id || !c.name || seenPeople.has(c.id)) continue;
      seenPeople.add(c.id);
      people.push({
        tmdbId: c.id,
        name: c.name,
        role: c.character || "Cast",
        profile: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined,
        isCrew: false,
      });
    }

    if (people.length) item.people = people;

    const trailer = detail.videos?.results?.find((v) => v.site === "YouTube" && v.type === "Trailer");
    item.trailerKey = trailer?.key;

    item.genres = detail.genres?.map((g) => g.name);
    const mins = detail.runtime ?? detail.episode_run_time?.[0];
    if (mins) item.runtime = `${mins} min`;

    /*
       Whether the date is a fact or a guess.

       TMDB gives every unreleased film a `release_date` regardless of whether
       anyone has announced one, so the field alone cannot be printed as fact —
       a title turned up dated 1 December 2026 with nothing behind it at all.
       `release_dates` is the corroboration: one entry per country that has an
       actual announced release, and Avengers: Secret Wars carries a US
       theatrical entry for 2027 while the invented date carries none.

       `status` is deliberately not used for this. "Planned" describes how far
       along the production is, not how well known the date is, and plenty of
       planned films have a studio date years out.

       Series have no such endpoint. There the tell is the placeholder itself:
       TMDB dates an announced-but-unscheduled show to the first of January, so
       a 1 January first-air date that has not happened yet is a year, not a
       day. Real 1 January premieres exist, but they are in the past by the
       time it matters — this only ever downgrades a future date.
    */
    if (kind === "movie") {
      // `item.releaseIso` is still TMDB's primary date here — the earliest
      // release anywhere — which is what tells a re-release from a release.
      const us = usReleaseDate(detail.release_dates, item.releaseIso);

      if (us) {
        // An announced American release: the date, and the source, we want.
        item.releaseIso = us;
        item.releaseDate = formatDate(us) ?? item.releaseDate;
        item.year = us.slice(0, 4);
        item.releaseConfirmed = true;
      } else {
        /*
           No US release announced — a foreign film, usually. Falling back to
           the primary rather than refusing to date it at all: an Arabic or
           French title that never opens in America still has a real release,
           and blanking it would punish exactly the catalogues this app exists
           to cover. It has to be corroborated to be printed as a day, with a
           week of tolerance because countries open on different days.
        */
        const announced = (detail.release_dates?.results ?? []).flatMap((r) =>
          (r.release_dates ?? []).map((x) => (x.release_date ?? "").slice(0, 10)),
        );
        const primary = item.releaseIso;
        item.releaseConfirmed =
          Boolean(primary) && announced.some((d) => d && Math.abs(dayGap(d, primary!)) <= 7);
      }
    } else {
      const iso = item.releaseIso;
      const today = isoDate();
      item.releaseConfirmed = Boolean(iso) && !(iso!.endsWith("-01-01") && iso! > today);
    }

    const alts = rankCommunityPosters(
      detail.images?.posters,
      raw.poster_path,
      6,
      raw.original_language,
    );
    if (alts.length) {
      item.poster = `${IMG}/w500${alts[0]}`;
      item.posters = alts.map((path) => `${IMG}/w500${path}`);
    }

    const imdbId = detail.external_ids?.imdb_id;
    if (imdbId) {
      item.imdbId = imdbId;
      item.key = imdbId;
      const real = await fetchImdbRating(kind, imdbId);
      if (real) item.rating = real;
    }
  } catch {
    // keep the base item
  }

  return item;
}

/* ------------------------------------------------------------------ *
 * Artwork
 * ------------------------------------------------------------------ */

/**
 * Picks the community poster to show instead of the official key art.
 *
 * Every image in TMDB's `posters` array was uploaded and voted on by its
 * contributors, and `poster_path` is only the one ranked first — nearly always
 * the distributor's own theatrical one-sheet. Using it means looking like
 * every other TMDB front end, so the default is dropped from the running here.
 *
 * This used to prefer textless art, on the theory that no burnt-in title would
 * fight the one the layout prints beside it. That was a mistake, and the
 * numbers say why: textless posters are a tiny and barely-voted corner of the
 * catalogue — Fight Club has 4 of them against 51 English ones, and the best
 * supported textless image has 4 votes where the best English one has 52. A
 * textless poster is also usually not artwork in its own right; it is the
 * official sheet with the logo taken off, which reads exactly as flat as it
 * sounds.
 *
 * Ranking by what the community actually endorsed lands somewhere better: the
 * alternative designs, festival sheets and fan pieces that people bothered to
 * vote for. Textless images stay eligible and simply rarely win, because
 * almost nobody votes for them.
 *
 * The score is the same Bayesian weighted rating the title rails use, for the
 * same reason — a single 10.0 vote must not beat a 7.1 backed by fifty. An
 * unvoted poster is skipped entirely: no votes is not an endorsement, and TMDB
 * has plenty of images nobody has ever looked at.
 *
 * Language is handled by the caller, which asks TMDB for `null,en` only. That
 * is what keeps a Ukrainian or Thai wordmark off an English page — there are
 * more of those on a popular film than there are English ones.
 */
export function rankCommunityPosters(
  posters: TmdbPoster[] | undefined,
  defaultPath?: string | null,
  limit = 6,
  originalLanguage?: string | null,
): string[] {
  /*
     Which languages may appear on a poster: none at all, English, or the
     language the title was made in.

     Restricting to `null,en` starved exactly the tabs that needed help most —
     13 of 72 anime titles could rotate, and 1 of 24 Arabic ones. Attack on
     Titan carries 40 Japanese posters that were being thrown away, and they
     are not a compromise for an anime; they are the artwork the show actually
     shipped with. The same goes for an Arabic film's Arabic sheet.

     Everything else still goes: a Ukrainian or Thai wordmark on a Hollywood
     film is not artwork with a point of view, it is the same poster someone
     else localised.
  */
  const languages = new Set<string | null>([null, "en"]);
  if (originalLanguage) languages.add(originalLanguage);

  const all = (posters ?? []).filter(
    (p) => p.file_path && p.file_path !== defaultPath && languages.has(p.iso_639_1),
  );
  if (!all.length) return defaultPath ? [defaultPath] : [];

  const mean = all.length
    ? all.reduce((sum, p) => sum + (p.vote_average ?? 0), 0) / all.length
    : 0;

  /*
     The vote count at which a poster's own average starts to be trusted.

     Far lower than the rails use, because poster voting is far thinner than
     title voting — fifty votes is a landslide here where it is nothing for a
     film. Set much higher and every poster collapses toward the mean, which
     hands the pick back to whatever happens to be first.
  */
  const CONFIDENCE = 8;

  const rank = (pool: TmdbPoster[]) =>
    pool
      .map((poster) => ({
        path: poster.file_path,
        score: weightedRating(
          poster.vote_average ?? 0,
          poster.vote_count ?? 0,
          mean,
          CONFIDENCE,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .map((p) => p.path);

  /*
     Ranked, not filtered.

     There were rating gates here — a vote floor and an average floor — and
     they cost more than they bought. Poster voting is far thinner than it
     looks: Attack on Titan carries 78 rated posters and only 4 average above
     5.0, so the gates were rejecting most of the artwork on the strength of a
     handful of votes it never received. Unrated is not the same as bad.

     The weighted ranking already does the job the floors were meant to do. A
     poster with one perfect vote is pulled hard toward the mean and lands
     below a 7.1 backed by fifty, so the best-supported image still leads —
     which is what matters, since index 0 is what a client sees when it wants
     only one. The rest fill the rotation in descending order of support.

     The one thing still filtered is shape, and that is not a judgement about
     quality: a crop, a banner or a phone wallpaper letterboxes inside a poster
     card whatever anyone thinks of it. Full width and something close to the
     2:3 a poster is supposed to be.
  */
  const wellFormed = all.filter(
    (p) =>
      (p.width ?? 0) >= 500 &&
      (p.aspect_ratio ?? 0) >= 0.6 &&
      (p.aspect_ratio ?? 0) <= 0.72,
  );

  // Nothing well-formed is better than nothing at all, so fall back to the
  // unfiltered set rather than showing a title no artwork.
  const chosen = rank(wellFormed.length ? wellFormed : all).slice(0, limit);

  /*
     The official sheet, appended rather than dropped.

     Too generic to lead with — that was the whole point of preferring
     community artwork — but it is the community's own first-ranked image, and
     a title whose alternatives are thin deserves a second face rather than a
     poster that never changes.
  */
  if (defaultPath && chosen.length < limit && !chosen.includes(defaultPath)) {
    chosen.push(defaultPath);
  }

  return chosen;
}

/** The single best community poster — the head of the ranking above. */
export function pickCommunityPoster(
  posters: TmdbPoster[] | undefined,
  defaultPath?: string | null,
): string | undefined {
  return rankCommunityPosters(posters, defaultPath, 1)[0];
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await task(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Anything with enough identity to look its artwork up. */
interface PosterUpgradable {
  tmdbId?: number;
  imdbId?: string;
  kind: MediaKind;
  poster?: string;
}

/**
 * Swaps in community artwork for items that arrived with someone else's.
 *
 * Rails built by `curate` already get this inside `enrich`. Two surfaces do
 * not: Discover is served from Cinemeta, whose posters come from metahub — one
 * fixed image per IMDb id, the same one every Stremio install shows — and the
 * calendar builds straight from TMDB's `poster_path`, which is the official
 * sheet by definition.
 *
 * One request per title, not two. Asking for the detail with
 * `append_to_response=images` returns the artwork *and* `poster_path` in the
 * same response, which matters beyond the round trip saved: `/images` alone
 * never says which poster is the default, so the version that called it could
 * not exclude the official sheet and sometimes picked it straight back.
 *
 * Lookups are memoised per call. The calendar lists a series once per air
 * date, so a show with eight episodes in a month is eight entries sharing one
 * `tmdbId` — without this it would be looked up eight times.
 *
 * Only worth doing on routes Next revalidates on a timer; on a per-request
 * path the reader would pay for it. Every failure keeps the poster the item
 * came in with — these routes are cached or prerendered, and artwork is never
 * worth failing a build over.
 */
export async function withCommunityPosters<T extends PosterUpgradable>(items: T[]): Promise<T[]> {
  const resolved = new Map<string, string[]>();

  const artwork = async (tmdbId: number, kind: MediaKind): Promise<string[]> => {
    const memo = `${kind}:${tmdbId}`;
    const hit = resolved.get(memo);
    if (hit !== undefined) return hit;

    const endpoint = kind === "movie" ? "movie" : "tv";
    const detail = await tmdb<{
      poster_path?: string | null;
      original_language?: string;
      images?: { posters?: TmdbPoster[] };
    }>(
      `/${endpoint}/${tmdbId}`,
      { append_to_response: endpoint === "movie" ? MOVIE_APPEND : "images" },
      86400,
    );

    const paths = rankCommunityPosters(
      detail.images?.posters,
      detail.poster_path,
      6,
      detail.original_language,
    );
    resolved.set(memo, paths);
    return paths;
  };

  return mapLimit(items, 8, async (item) => {
    try {
      let tmdbId = item.tmdbId;
      let kind = item.kind;

      if (!tmdbId) {
        if (!item.imdbId) return item;
        const found = await findByImdbId(item.imdbId);
        if (!found) return item;
        tmdbId = found.tmdbId;
        // Cinemeta and TMDB disagree often enough about what is a series that
        // the lookup's own answer is the one to trust.
        kind = found.kind;
      }

      const paths = await artwork(tmdbId, kind);
      if (!paths.length) return item;
      const urls = paths.map((path) => `${IMG}/w500${path}`);
      return { ...item, poster: urls[0], posters: urls };
    } catch {
      return item;
    }
  });
}

/* ------------------------------------------------------------------ *
 * Curation
 * ------------------------------------------------------------------ */

/**
 * Bayesian weighted rating — the formula IMDb uses for its Top 250.
 *
 *   WR = (v/(v+m))·R + (m/(v+m))·C
 *
 * Raw `vote_average.desc` is why the legacy "Hidden Gems" rail surfaced
 * junk: a film with nine 10-star votes outranks a masterpiece with 4,000
 * votes averaging 8.4. Pulling thinly-voted titles toward the pool mean
 * fixes that, which matters most for the low-vote rails.
 */
function weightedRating(rating: number, votes: number, mean: number, minVotes: number): number {
  if (!votes) return 0;
  return (votes / (votes + minVotes)) * rating + (minVotes / (votes + minVotes)) * mean;
}

async function discoverRaw(
  endpoint: "movie" | "tv",
  params: Record<string, string>,
  pages = 1,
): Promise<TmdbListItem[]> {
  const out: TmdbListItem[] = [];
  for (let p = 1; p <= pages; p++) {
    const data = await tmdb<{ results?: TmdbListItem[] }>(`/discover/${endpoint}`, {
      ...params,
      page: String(p),
    });
    out.push(...(data.results ?? []));
  }
  return out;
}

interface CurateOptions {
  /** Votes at which a title's own average is trusted. Higher = more cautious. */
  minVotes?: number;
  /** Drop anything rated below this before ranking. */
  floor?: number;
  /**
   * Second floor applied *after* enrichment, against the IMDb rating.
   * TMDB and IMDb disagree often enough that a title can pass a 7.2 TMDB
   * filter and come back rated 5.4 on IMDb — which is exactly how a bad film
   * ended up in "Under the Radar".
   */
  postFloor?: number;
  limit?: number;
  pages?: number;
  /**
   * How many candidates to enrich before the post-enrichment floor is applied.
   * Defaults to twice `limit`, which buys slack for titles the IMDb floor
   * discards. Enrichment is two network calls per title, so rails drawing on a
   * pool where almost nothing gets discarded — regional catalogues, where the
   * floor is already low — can profitably ask for less.
   */
  shortlist?: number;
  /**
   * A genre name the title must actually be *about*, not merely carry.
   *
   * TMDB's `with_genres` matches membership, and membership is generous: Pulp
   * Fiction is a Comedy, Forrest Gump is a Romance, Chainsaw Man is a Romance.
   * All three are true and none of them is what someone pressing that chip
   * meant. The `genres` array on a detail response is ordered, and that order
   * carries the answer — Pulp Fiction is "Thriller, Crime, Comedy", Casablanca
   * is "Drama, Romance". So a genre-led rail asks for its genre to lead.
   *
   * Only for rails defined by a genre alone. A keyword-led rail is already
   * precise, and this would just thin it.
   */
  leadGenre?: string;
}

/** How far down a title's genre list still counts as leading. */
const LEAD_DEPTH = 2;

/**
 * Fetches a wide candidate pool cheaply (list data only), pre-ranks it,
 * enriches a shortlist, then re-ranks on the enriched rating.
 *
 * Enrichment costs a request per title, so pre-ranking keeps a rail to ~24
 * detail calls instead of ~120 — but the final ordering and the quality floor
 * both use the IMDb rating, which is the number a viewer actually trusts.
 */
async function curate(
  endpoint: "movie" | "tv",
  params: Record<string, string>,
  {
    minVotes = 500,
    floor = 6.5,
    postFloor,
    limit = 12,
    pages = 2,
    shortlist: shortlistSize,
    leadGenre,
  }: CurateOptions = {},
): Promise<MediaItem[]> {
  const kind: MediaKind = endpoint === "movie" ? "movie" : "series";

  const raw = (await discoverRaw(endpoint, params, pages)).filter(
    (r) => r.poster_path && r.overview && (r.vote_count ?? 0) > 0,
  );
  if (!raw.length) return [];

  const mean = raw.reduce((s, r) => s + (r.vote_average ?? 0), 0) / raw.length;

  // Shortlist twice what we need, so the post-enrichment floor has slack to
  // discard titles without leaving the rail short.
  const shortlist = raw
    .filter((r) => (r.vote_average ?? 0) >= floor)
    .map((r) => ({
      raw: r,
      score: weightedRating(r.vote_average ?? 0, r.vote_count ?? 0, mean, minVotes),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, shortlistSize ?? limit * 2);

  const enriched = await Promise.all(shortlist.map((r) => enrich(r.raw, kind)));

  const bar = postFloor ?? floor;
  const passed = enriched.filter((item) => {
    const r = parseFloat(item.rating ?? "0");
    return Number.isFinite(r) && r >= bar;
  });

  const ranked = (pool: MediaItem[]) =>
    pool
      .map((item) => ({
        item,
        score: weightedRating(
          parseFloat(item.rating ?? "0"),
          item.voteCount ?? 0,
          mean,
          minVotes,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

  if (!leadGenre) return ranked(passed).slice(0, limit);

  /*
     Titles the genre actually describes first, then the rest.

     Tiered rather than filtered outright, because the depth is a judgement
     and a hard cut throws away real members: No Country for Old Men is
     "Crime, Thriller, Western" and belongs on a Westerns rail even though the
     genre comes third. So a rail leads with the titles the genre leads for,
     and only reaches past that when it would otherwise come up short.
  */
  const at = (item: MediaItem) => (item.genres ?? []).indexOf(leadGenre);
  const leads = passed.filter((item) => {
    const i = at(item);
    return i > -1 && i < LEAD_DEPTH;
  });
  const trails = passed.filter((item) => at(item) >= LEAD_DEPTH);

  return [...ranked(leads), ...ranked(trails)].slice(0, limit);
}

export interface RecommendationSeed {
  imdbId: string;
  tmdbId: number;
  kind: MediaKind;
  title: string;
  poster?: string;
}

/**
 * Genres too broad to be evidence of anything on their own.
 *
 * Nearly half the catalogue is a Drama, so "also a Drama" is not a reason to
 * put a film in front of someone. These four are therefore not allowed to
 * satisfy the similarity gate by themselves — see `recommendationsFor`. The
 * ids are shared between TMDB's film and television vocabularies, so one set
 * covers both.
 */
const GENERIC_GENRES = new Set([18, 35, 10751, 10749]);

/**
 * Keywords that describe how a title was made or when it is set, rather than
 * what it is about.
 *
 * The keyword vocabulary needs the same treatment as the genre one: "miniseries"
 * is true of Chernobyl and equally true of The Haunting of Bly Manor, so it is
 * not evidence that one is like the other. Decades go for the same reason — a
 * period tag is a setting, not a subject.
 */
const GENERIC_KEYWORDS = new Set([
  "miniseries",
  "mini-series",
  "limited series",
  "anthology",
  "woman director",
  "aftercreditsstinger",
  "duringcreditsstinger",
]);

const isDistinctiveKeyword = (name: string) => {
  const n = name.trim().toLowerCase();
  // "1980s", "1990s" — a decade tag places a title, it does not describe it.
  return !GENERIC_KEYWORDS.has(n) && !/^\d{4}s$/.test(n);
};

/** Candidates kept for enrichment. Twelve leaves slack above the ten returned. */
const REC_SHORTLIST = 12;
/** Quality bar a neighbour must clear before it is worth recommending. */
const REC_MIN_VOTES = 100;
const REC_MIN_RATING = 6;
/**
 * The same bar, lowered, for candidates admitted on a shared subject.
 *
 * The floors exist because genre overlap is weak evidence, so quality has to
 * carry more of the weight. A shared distinctive keyword is much stronger
 * evidence than a shared genre, and the titles it finds are often small: the
 * two best answers for Chernobyl — Lockerbie and Toxic Town, both true-story
 * disasters — sit at 90 and 89 votes and were thrown away by a bar set for a
 * weaker signal.
 */
const REC_MIN_VOTES_KEYWORD = 50;

/** How many of TMDB's own recommendations are worth a keyword lookup each. */
const KEYWORD_LOOKUPS = 16;

/**
 * "More like this", from one title someone actually watched.
 *
 * Relevance decides who is eligible; quality decides the order. Those are
 * separate questions and the first version conflated them — it merged
 * `/recommendations` and `/similar` into one pool and sorted the lot by
 * weighted rating, which threw away the only real similarity signal in the
 * data and let the weaker endpoint win on popularity. Seeded with Miss Sloane
 * it returned Remember the Titans and Steel Magnolias: both well-liked, both
 * sharing exactly one genre with it, Drama.
 *
 * So:
 *
 * **`/recommendations` is walked in TMDB's own order and never re-sorted.**
 * That order is a behavioural ranking — what people who watched this went on
 * to watch — and it is the whole signal. Re-sorting it destroys it, the same
 * trap `searchMulti` documents for search results.
 *
 * **A candidate must share a genre that means something.** Tier by tier:
 * one distinctive genre; failing that two of any kind; failing that
 * `/similar`, which is tag overlap rather than behaviour and has to clear a
 * higher bar to be used at all. The second tier is not a rare fallback — a
 * seed whose own genres are all generic, which is every romantic comedy,
 * produces nothing at the first.
 *
 * **Where genre cannot discriminate at all, subject does.** A seed whose only
 * genre is a generic one gets no signal from the gate above — every candidate
 * either shares that genre or is not in the pool. Those seeds are matched on
 * TMDB's keywords instead: Chernobyl carries `nuclear catastrophe`, `disaster`,
 * `based on true story`, and its recommendation list splits cleanly on them —
 * Lockerbie, Toxic Town and Station Eleven share one, while My Life with the
 * Walter Boys and Dear Edward share none. Format and period tags are excluded
 * for the same reason generic genres are; "also a miniseries set in the 1980s"
 * is how Bly Manor would otherwise arrive next to Chernobyl.
 *
 * That costs one request per candidate, which is why it runs only for the seeds
 * genre cannot serve, and why the whole route is cached for a day.
 *
 * That second tier asks for two shared genres *or as many as the seed has*,
 * which is not pedantry. Chernobyl's entire TMDB genre list is `[Drama]`: it
 * cannot offer a distinctive genre to the first tier, and it cannot offer two
 * of anything to the second, so a fixed two made every tier unsatisfiable and
 * returned nothing at all for a title with twenty recommendations waiting.
 * Single-genre titles are common among prestige drama. Capping the requirement
 * at what the seed actually has changes nothing for a seed with two or more —
 * Miss Sloane, the case this gate was built for, carries three.
 *
 * Only then does rating matter, and only among titles already established as
 * similar: the shortlist is enriched — which replaces TMDB's rating with
 * IMDb's — and ordered by the same weighted rating the curated rails use, so
 * a five-vote 10/10 cannot lead the row. This is `curate`'s two-stage shape,
 * for the same reasons.
 *
 * Returns more than the rail shows, because the client drops anything already
 * in the viewer's library and a list exactly five long would go short.
 *
 * Where TMDB's own pool is thin this cannot invent a better one — it stops the
 * picks being wrong, it cannot make the data richer.
 */
/**
 * A title's keyword ids.
 *
 * Films and television disagree about the field name — `/movie/{id}/keywords`
 * answers with `keywords`, `/tv/{id}/keywords` with `results` — and reading the
 * wrong one returns an empty set rather than an error, which would look exactly
 * like a title with no keywords. Both are read.
 */
async function keywordsFor(
  endpoint: "movie" | "tv",
  id: number,
): Promise<{ id: number; name: string }[]> {
  type KeywordList = {
    keywords?: { id: number; name: string }[];
    results?: { id: number; name: string }[];
  };

  const data = await tmdb<KeywordList>(`/${endpoint}/${id}/keywords`, {}, 86400).catch(
    () => ({}) as KeywordList,
  );

  return data.keywords ?? data.results ?? [];
}

export async function recommendationsFor(
  imdbId: string,
  limit = 10,
): Promise<{ seed: RecommendationSeed | null; items: MediaItem[] }> {
  const found = await findByImdbId(imdbId);
  if (!found) return { seed: null, items: [] };

  const { tmdbId, kind } = found;
  const endpoint = kind === "movie" ? "movie" : "tv";

  // The seed's own record: its name for the heading, its genres for the gate.
  const detail = await tmdb<TmdbListItem & TmdbDetail>(`/${endpoint}/${tmdbId}`, {}, 86400).catch(
    () => null,
  );
  const seed: RecommendationSeed = {
    imdbId,
    tmdbId,
    kind,
    title: detail?.title || detail?.name || "",
    poster: detail?.poster_path ? `${IMG}/w342${detail.poster_path}` : undefined,
  };

  const seedGenres = new Set(
    (detail?.genres ?? []).map((g) => g.id).filter((id): id is number => typeof id === "number"),
  );

  const [recommended, similar] = await Promise.all([
    tmdb<{ results?: TmdbListItem[] }>(`/${endpoint}/${tmdbId}/recommendations`, {}, 86400)
      .then((d) => d.results ?? [])
      .catch(() => [] as TmdbListItem[]),
    tmdb<{ results?: TmdbListItem[] }>(`/${endpoint}/${tmdbId}/similar`, {}, 86400)
      .then((d) => d.results ?? [])
      .catch(() => [] as TmdbListItem[]),
  ]);

  const seen = new Set<number>([tmdbId]);
  const shortlist: TmdbListItem[] = [];

  const worthShowing = (raw: TmdbListItem) =>
    Boolean(raw.id) &&
    !seen.has(raw.id) &&
    Boolean(raw.poster_path) &&
    Boolean(raw.overview) &&
    (raw.vote_count ?? 0) >= REC_MIN_VOTES &&
    (raw.vote_average ?? 0) >= REC_MIN_RATING;

  /** Appends whatever passes, in the order given, until the shortlist is full. */
  const gather = (list: TmdbListItem[], minShared: number, minDistinctive: number) => {
    for (const raw of list) {
      if (shortlist.length >= REC_SHORTLIST) return;
      if (!worthShowing(raw)) continue;

      const shared = (raw.genre_ids ?? []).filter((id) => seedGenres.has(id));
      if (shared.length < minShared) continue;
      if (shared.filter((id) => !GENERIC_GENRES.has(id)).length < minDistinctive) continue;

      seen.add(raw.id);
      shortlist.push(raw);
    }
  };

  /**
   * Appends candidates that share a subject with the seed.
   *
   * Only the keyword lookups are parallel; the loop that keeps them stays in
   * TMDB's order, because that order is the behavioural ranking and is still
   * the primary signal — the keywords decide who is eligible, not who leads.
   */
  const gatherByKeyword = async (list: TmdbListItem[]) => {
    const seedKeywords = new Set(
      (await keywordsFor(endpoint, tmdbId)).filter((k) => isDistinctiveKeyword(k.name)).map((k) => k.id),
    );
    if (!seedKeywords.size) return;

    const pool = list
      .filter(
        (raw) =>
          Boolean(raw.id) &&
          !seen.has(raw.id) &&
          Boolean(raw.poster_path) &&
          Boolean(raw.overview) &&
          (raw.vote_count ?? 0) >= REC_MIN_VOTES_KEYWORD &&
          (raw.vote_average ?? 0) >= REC_MIN_RATING,
      )
      .slice(0, KEYWORD_LOOKUPS);

    const keywords = await Promise.all(pool.map((raw) => keywordsFor(endpoint, raw.id)));

    pool.forEach((raw, i) => {
      if (shortlist.length >= REC_SHORTLIST) return;
      const shares = keywords[i].some((k) => seedKeywords.has(k.id));
      if (!shares) return;
      seen.add(raw.id);
      shortlist.push(raw);
    });
  };

  const seedHasDistinctiveGenre = [...seedGenres].some((id) => !GENERIC_GENRES.has(id));

  if (seedHasDistinctiveGenre) {
    gather(recommended, 1, 1);
    gather(recommended, Math.min(2, seedGenres.size), 0);
    /*
       `/similar` is never admitted on a generic genre alone, so this one keeps
       its distinctive requirement rather than being capped like the tier
       above. Tag overlap plus "also a Drama" is precisely the pairing that put
       Steel Magnolias next to Miss Sloane.
    */
    gather(similar, 2, 1);
  } else if (seedGenres.size) {
    // Genre is blind for this seed: match on what it is about instead.
    await gatherByKeyword(recommended);

    /*
       Genre as the last resort, not the first. If the seed has no keywords —
       or none of its recommendations share one — a row of titles that at least
       share its genre and its audience beats an empty one, and the caller says
       out loud how few it found.
    */
    if (!shortlist.length) gather(recommended, Math.min(2, seedGenres.size), 0);
  } else {
    // No genres to compare against — the seed's detail call failed. TMDB's own
    // ordering is still worth showing; silently returning nothing is not.
    gather(recommended, 0, 0);
  }

  if (!shortlist.length) return { seed, items: [] };

  const enriched = await Promise.all(shortlist.map((raw) => enrich(raw, kind)));
  const mean =
    enriched.reduce((sum, item) => sum + (parseFloat(item.rating ?? "0") || 0), 0) /
    enriched.length;

  return {
    seed,
    items: enriched
      .map((item) => ({
        item,
        score: weightedRating(
          parseFloat(item.rating ?? "0") || 0,
          item.voteCount ?? 0,
          mean,
          300,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.item),
  };
}

/** Full enrichment for a known TMDB id — used by the details modal. */
export async function enrichById(tmdbId: number, kind: MediaKind): Promise<MediaItem | null> {
  const endpoint = kind === "movie" ? "movie" : "tv";
  try {
    const raw = await tmdb<TmdbListItem>(`/${endpoint}/${tmdbId}`, {});
    return await enrich({ ...raw, id: tmdbId }, kind);
  } catch {
    return null;
  }
}

/**
 * Poster URLs only, for the background wall.
 *
 * Deliberately skips `enrich`, which costs one TMDB request per title: the wall
 * shows art and nothing else, so two `discover` pages per kind buy ~40 posters
 * for two requests instead of forty.
 */
export async function posterWall(endpoint: "movie" | "tv", pages = 3): Promise<string[]> {
  const raw = await discoverRaw(
    endpoint,
    { sort_by: "popularity.desc", "vote_count.gte": "200" },
    pages,
  );
  /*
     `w185`, the smallest useful width.

     These are the background wall's tiles. They render at 156px on desktop and
     108px on mobile, behind a scrim, at 0.58 opacity, blurred by depth — and
     there are 192 of them on screen at once, which made them the single
     largest transfer on the landing page by a wide margin. `w342` was over
     twice the width any of them is ever drawn at, for an image nobody can
     resolve.
  */
  return raw
    .filter((r) => r.poster_path)
    .map((r) => `${IMG}/w185${r.poster_path}`);
}

export async function discoverEnriched(
  endpoint: "movie" | "tv",
  params: Record<string, string>,
  limit = 20,
): Promise<MediaItem[]> {
  const kind: MediaKind = endpoint === "movie" ? "movie" : "series";
  const raw = (await discoverRaw(endpoint, params, 1))
    .filter((r) => r.poster_path)
    .slice(0, limit);
  return Promise.all(raw.map((r) => enrich(r, kind)));
}

export { curate };

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/**
 * Global search.
 *
 * The ranking here is deliberately *no ranking at all* — TMDB's own result
 * order is kept.
 *
 * It used to re-sort by `vote_count` descending, on the reasoning that this
 * stops a query like "the" surfacing obscure shorts. What it actually did was
 * make unreleased films unfindable, because a film that has not come out has
 * zero votes by definition and sank below every established title with a
 * similar name before the list was cut to eight. Searching "The Odyssey"
 * returned four older films of that name and not Nolan's; anything upcoming was
 * only visible when the query was so specific that nothing else matched.
 *
 * TMDB's own ordering is already a relevance-and-popularity blend, and it puts
 * anticipated titles where they belong — "Avengers" returns Doomsday first,
 * "Dune" surfaces Part Three, "Spider-Man" leads with Brand New Day. Sorting on
 * top of it only ever made things worse: an exact-title bonus strong enough to
 * lift Nolan's Odyssey also lifted a 1967 Spider-Man cartoon over No Way Home,
 * and a positional nudge put "Breaking Bad Wolf" above El Camino.
 *
 * `limit` is generous because the modal shows the first few and reveals the
 * rest when the query is submitted — one request serves both, since
 * enrichment runs in parallel and costs latency once rather than per title.
 */
export async function searchMulti(query: string, limit = 24): Promise<SearchResults> {
  // Two pages, because page one is 20 results across films, series *and*
  // people, which can leave very few titles for a name-heavy query.
  const [first, second] = await Promise.all([
    tmdb<{ results?: TmdbListItem[]; total_pages?: number }>(
      "/search/multi",
      { query, include_adult: "false", page: "1" },
      600,
    ),
    tmdb<{ results?: TmdbListItem[] }>(
      "/search/multi",
      { query, include_adult: "false", page: "2" },
      600,
    ).catch(() => ({ results: [] as TmdbListItem[] })),
  ]);

  /*
     Deduped, because TMDB's paging overlaps: a query for "Avengers" returns
     six of its thirty-nine title rows on *both* page one and page two. Every
     duplicate was enriched twice — four wasted upstream calls each — and then
     rendered twice, under the same React key, since `enrich` keys an item by
     its IMDb id. Marvel Disk Wars and Masked Avengers each appeared in the
     results list twice.
  */
  const results: TmdbListItem[] = [];
  const seen = new Set<string>();
  for (const r of [...(first.results ?? []), ...(second.results ?? [])]) {
    const id = `${r.media_type}:${r.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push(r);
  }

  const titleRaw = results
    .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path)
    .slice(0, limit);

  const titles = await Promise.all(
    titleRaw.map((r) => enrich(r, r.media_type === "tv" ? "series" : "movie")),
  );

  const people = results
    .filter((r) => r.media_type === "person")
    .slice(0, 8)
    .map((p) => ({
      tmdbId: p.id,
      name: p.name ?? "Unknown",
      department: p.known_for_department,
      profile: p.profile_path ? `${IMG}/w185${p.profile_path}` : undefined,
      knownFor: (p.known_for ?? [])
        .map((k) => k.title || k.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(", "),
    }));

  return { titles, people };
}

/** Anime search — TMDB TV filtered to Japanese animation. */
export async function searchAnime(query: string, limit = 12): Promise<MediaItem[]> {
  const data = await tmdb<{ results?: TmdbListItem[] }>("/search/tv", { query }, 600);

  const results = (data.results ?? [])
    .filter(
      (r) => r.poster_path && r.original_language === "ja" && (r.genre_ids ?? []).includes(16),
    )
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, limit);

  return Promise.all(results.map((r) => enrich(r, "series")));
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

interface TmdbPerson {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  profile_path?: string | null;
  known_for_department?: string;
  external_ids?: { imdb_id?: string | null };
  combined_credits?: {
    cast?: TmdbListItem[];
    crew?: TmdbListItem[];
  };
}

function toCredit(raw: TmdbListItem, role?: string): PersonCredit | null {
  if (!raw.id) return null;
  const date = raw.release_date || raw.first_air_date;
  const kind: MediaKind = raw.media_type === "tv" || raw.first_air_date ? "series" : "movie";

  return {
    key: `${raw.id}-${raw.credit_id ?? role ?? ""}`,
    tmdbId: raw.id,
    title: raw.title || raw.name || "Untitled",
    kind,
    poster: raw.poster_path ? `${IMG}/w342${raw.poster_path}` : undefined,
    year: date ? date.slice(0, 4) : undefined,
    releaseDate: formatDate(date),
    role,
    rating: raw.vote_average ? raw.vote_average.toFixed(1) : undefined,
    voteCount: raw.vote_count,
  };
}

export async function fetchPerson(id: number): Promise<Person | null> {
  let raw: TmdbPerson;
  try {
    raw = await tmdb<TmdbPerson>(`/person/${id}`, {
      append_to_response: "combined_credits,external_ids",
    });
  } catch {
    return null;
  }
  if (!raw?.id) return null;

  const cast = (raw.combined_credits?.cast ?? []).map((c) => toCredit(c, c.character || "Cast"));
  // Only the crew roles a viewer cares about; TMDB lists dozens per film.
  const KEY_JOBS = /^(Director|Screenplay|Writer|Story|Novel|Producer|Creator|Executive Producer)$/;
  const crew = (raw.combined_credits?.crew ?? [])
    .filter((c) => KEY_JOBS.test(c.job ?? ""))
    .map((c) => toCredit(c, c.job));

  const all = [...cast, ...crew].filter((c): c is PersonCredit => c !== null);

  // The same title can appear twice (wrote *and* directed) — merge the roles.
  const merged = new Map<number, PersonCredit>();
  for (const c of all) {
    const existing = merged.get(c.tmdbId);
    if (existing) {
      if (c.role && existing.role && !existing.role.includes(c.role)) {
        existing.role = `${existing.role}, ${c.role}`;
      }
    } else {
      merged.set(c.tmdbId, { ...c });
    }
  }

  const today = isoDate();
  const credits = [...merged.values()];

  // Compare on raw ISO dates, not the formatted ones — build a lookup once
  // rather than re-scanning the credit arrays for every comparison.
  const dateById = new Map<number, string>();
  for (const c of [...(raw.combined_credits?.cast ?? []), ...(raw.combined_credits?.crew ?? [])]) {
    const d = c.release_date || c.first_air_date || "";
    if (d && !dateById.has(c.id)) dateById.set(c.id, d);
  }
  const rawDate = (c: PersonCredit) => dateById.get(c.tmdbId) ?? "";

  // "Upcoming" = dated in the future, or announced with no date yet.
  const future = credits
    .filter((c) => {
      const d = rawDate(c);
      return !d || d > today;
    })
    .sort((a, b) => (rawDate(a) || "9999").localeCompare(rawDate(b) || "9999"));

  const released = credits
    .filter((c) => {
      const d = rawDate(c);
      return d && d <= today;
    })
    .sort((a, b) => rawDate(b).localeCompare(rawDate(a)));

  const knownFor = [...released]
    .filter((c) => c.poster && (c.voteCount ?? 0) > 50)
    .sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0))
    .slice(0, 8);

  return {
    tmdbId: raw.id,
    name: raw.name,
    department: raw.known_for_department,
    biography: raw.biography || undefined,
    birthday: raw.birthday || undefined,
    deathday: raw.deathday || undefined,
    placeOfBirth: raw.place_of_birth || undefined,
    profile: raw.profile_path ? `${IMG}/w342${raw.profile_path}` : undefined,
    imdbId: raw.external_ids?.imdb_id || undefined,
    knownFor,
    /*
       Both caps are deliberately generous, because the client splits these
       lists by kind and the cut happens here, before that split.

       At the old 40 the filmography was the 40 most recent credits of a mixed
       career — so a "Movies" filter on someone with a long television run
       showed three films and looked broken, when the rest had simply been
       thrown away server-side. TMDB returns every credit in the single
       `combined_credits` call above, so widening this costs payload and not
       one extra request.
    */
    upcoming: future.filter((c) => c.poster).slice(0, 24),
    filmography: released.filter((c) => c.poster).slice(0, 120),
  };
}

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

interface TmdbReview {
  author?: string;
  content?: string;
  url?: string;
  created_at?: string;
  author_details?: { rating?: number | null; username?: string };
}

/** TMDB community reviews. Presented as such — never dressed up as press. */
export async function fetchReviews(kind: MediaKind, tmdbId: number) {
  const endpoint = kind === "movie" ? "movie" : "tv";
  try {
    const data = await tmdb<{ results?: TmdbReview[] }>(`/${endpoint}/${tmdbId}/reviews`);
    return (data.results ?? [])
      .filter((r) => (r.content?.length ?? 0) > 180)
      .sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0))
      .slice(0, 4)
      .map((r) => ({
        author: r.author || r.author_details?.username || "Anonymous",
        rating: r.author_details?.rating ?? undefined,
        content: r.content ?? "",
        url: r.url,
        createdAt: r.created_at,
      }));
  } catch {
    return [];
  }
}

/** Finds the TMDB id behind an IMDb id, so reviews work from Cinemeta items. */
export async function findByImdbId(
  imdbId: string,
): Promise<{ tmdbId: number; kind: MediaKind } | null> {
  try {
    const data = await tmdb<{
      movie_results?: { id: number }[];
      tv_results?: { id: number }[];
    }>(`/find/${imdbId}`, { external_source: "imdb_id" }, 86400);

    if (data.movie_results?.length) return { tmdbId: data.movie_results[0].id, kind: "movie" };
    if (data.tv_results?.length) return { tmdbId: data.tv_results[0].id, kind: "series" };
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Mood / genre rails
 * ------------------------------------------------------------------ */

export interface Mood {
  id: string;
  label: string;
  blurb: string;
  params: Record<string, string>;
  minVotes?: number;
  floor?: number;
  /**
   * The same mood against the series catalogue, or `null` where it has no
   * honest equivalent there.
   *
   * It cannot just reuse `params`. TMDB keeps separate genre vocabularies for
   * film and television: Thriller (53), Science Fiction (878) and Horror (27)
   * simply do not exist on the TV side, where the nearest thing is the much
   * broader Sci-Fi & Fantasy (10765). Crime (80) happens to share an id.
   * Keywords are shared across both, so keyword-led moods carry over intact.
   *
   * Vote thresholds drop too. A series accumulates far fewer votes than a film
   * with the same audience, so reusing the film floors returned three results
   * and called it a mood.
   */
  tv?: {
    params: Record<string, string>;
    minVotes?: number;
    floor?: number;
    leadGenre?: string;
  } | null;
  /**
   * The genre this rail is named for, when it is named for one.
   *
   * Set only on the rails defined by a genre alone, and it is the TMDB genre
   * *name* because that is what survives enrichment. See `CurateOptions.leadGenre`
   * for what it does and why membership alone was not enough. Keyword-led
   * rails leave it unset: the keyword is already the precision, and asking a
   * keyword rail to also lead with a genre only thins it.
   */
  leadGenre?: string;
}

/** Keyword ids verified against TMDB's /search/keyword endpoint. */
export const MOODS: Mood[] = [
  {
    id: "psychological",
    label: "Psychological Thrillers",
    blurb: "Tension that works on the mind rather than the pulse.",
    params: { with_genres: "53", with_keywords: "12565", "vote_count.gte": "400" },
    // Genre 53 is film-only; the keyword carries the whole idea on the TV side.
    tv: { params: { with_keywords: "12565", "vote_count.gte": "150" }, minVotes: 250 },
  },
  {
    id: "novels",
    label: "Based on Novels",
    blurb: "Adaptations that earned their source material.",
    params: { with_keywords: "818", "vote_count.gte": "600" },
    tv: { params: { with_keywords: "818", "vote_count.gte": "150" }, minVotes: 250 },
  },
  {
    id: "scifi",
    label: "Science Fiction",
    blurb: "Ideas first, spectacle second.",
    leadGenre: "Science Fiction",
    params: { with_genres: "878", "vote_count.gte": "800" },
    // 10765 is Sci-Fi *and* Fantasy — broader than 878, and the only option.
    tv: { params: { with_genres: "10765", "vote_count.gte": "200" }, minVotes: 350, leadGenre: "Sci-Fi & Fantasy" },
  },
  {
    id: "neonoir",
    label: "Neo-Noir",
    blurb: "Moral fog, hard shadows, nobody clean.",
    params: { with_keywords: "207268", "vote_count.gte": "250" },
    tv: { params: { with_keywords: "207268", "vote_count.gte": "60" }, minVotes: 120 },
  },
  {
    id: "mindbenders",
    label: "Time & Memory",
    blurb: "Films that fold the timeline back on itself.",
    params: { with_keywords: "4379", "vote_count.gte": "400" },
    tv: { params: { with_keywords: "4379", "vote_count.gte": "80" }, minVotes: 150 },
  },
  {
    id: "heist",
    label: "Heists & Capers",
    blurb: "Plans, crews, and the moment it all goes wrong.",
    params: { with_keywords: "10051", "vote_count.gte": "300" },
    tv: { params: { with_keywords: "10051", "vote_count.gte": "60" }, minVotes: 120 },
  },
  {
    id: "comingofage",
    label: "Coming of Age",
    blurb: "The year everything changed.",
    params: { with_keywords: "10683", "vote_count.gte": "300" },
    tv: { params: { with_keywords: "10683", "vote_count.gte": "60" }, minVotes: 120 },
  },
  {
    id: "dystopia",
    label: "Dystopian Futures",
    blurb: "Tomorrow, gone wrong.",
    params: { with_keywords: "4565", "vote_count.gte": "400" },
    tv: { params: { with_keywords: "4565", "vote_count.gte": "80" }, minVotes: 150 },
  },
  {
    id: "crime",
    label: "Crime & Underworld",
    blurb: "Organised, personal, and rarely victimless.",
    leadGenre: "Crime",
    params: { with_genres: "80", "vote_count.gte": "800" },
    // Crime is one of the few ids the two vocabularies share.
    tv: { params: { with_genres: "80", "vote_count.gte": "200" }, minVotes: 350, leadGenre: "Crime" },
  },
  {
    id: "horror",
    label: "Horror That Lands",
    blurb: "Well-made frights, not cheap ones.",
    leadGenre: "Horror",
    params: { with_genres: "27", "vote_count.gte": "700" },
    /*
       Film only, deliberately. TMDB has no Horror genre for television and no
       keyword that stands in for one without dragging in half of Mystery, so
       the chip is hidden on the series side rather than shown over a rail of
       things that are not horror.
    */
    tv: null,
  },

  /* ---- Genres ---------------------------------------------------------- *
     Broad catalogues, so the vote floors are high: the point of a genre chip
     here is the good ones, not the many. TMDB's two vocabularies diverge most
     at this end — see `Mood.tv`.
   * ---------------------------------------------------------------------- */
  {
    id: "action",
    label: "Action & Spectacle",
    blurb: "Staged, shot and cut by people who knew what they were doing.",
    leadGenre: "Action",
    params: { with_genres: "28", "vote_count.gte": "1200" },
    // Television has no Action genre; 10759 is Action & Adventure, the nearest.
    tv: { params: { with_genres: "10759", "vote_count.gte": "300" }, minVotes: 450, leadGenre: "Action & Adventure" },
  },
  {
    id: "comedy",
    label: "Comedy",
    blurb: "Funny on purpose, and still funny now.",
    leadGenre: "Comedy",
    params: { with_genres: "35", "vote_count.gte": "1000" },
    tv: { params: { with_genres: "35", "vote_count.gte": "250" }, minVotes: 400, leadGenre: "Comedy" },
  },
  {
    id: "romance",
    label: "Romance",
    blurb: "Two people, and whatever is standing between them.",
    leadGenre: "Romance",
    params: { with_genres: "10749", "vote_count.gte": "1000" },
    /*
       TMDB has no Romance genre for television — 10749 is film-only, and the
       TV list has nothing standing in for it. The keyword does carry over, but
       it reaches a long tail of very thinly voted series, so the floor here is
       far higher than the usual TV one.
    */
    tv: { params: { with_keywords: "9840", "vote_count.gte": "300" }, minVotes: 450 },
  },
  {
    id: "fantasy",
    label: "Fantasy",
    blurb: "Worlds with their own rules, kept consistently.",
    leadGenre: "Fantasy",
    params: { with_genres: "14", "vote_count.gte": "800" },
    /*
       Film only. Television folds fantasy into Sci-Fi & Fantasy (10765), which
       is exactly what the Science Fiction chip already selects on this side —
       offering both would be two chips over one rail.
    */
    tv: null,
  },
  {
    id: "mystery",
    label: "Mystery & Detection",
    blurb: "A question worth the running time it takes to answer.",
    leadGenre: "Mystery",
    params: { with_genres: "9648", "vote_count.gte": "600" },
    tv: { params: { with_genres: "9648", "vote_count.gte": "200" }, minVotes: 350, leadGenre: "Mystery" },
  },
  {
    id: "war",
    label: "War & Conflict",
    blurb: "What it costs, told without a recruiting poster.",
    leadGenre: "War",
    params: { with_genres: "10752", "vote_count.gte": "500" },
    // 10768 is War & Politics — broader than the film genre, and the only one.
    tv: { params: { with_genres: "10768", "vote_count.gte": "150" }, minVotes: 250, leadGenre: "War & Politics" },
  },
  {
    id: "western",
    label: "Westerns",
    blurb: "Frontier, horizon, and somebody who won't move.",
    leadGenre: "Western",
    params: { with_genres: "37", "vote_count.gte": "300" },
    tv: { params: { with_genres: "37", "vote_count.gte": "50" }, minVotes: 120, leadGenre: "Western" },
  },
  {
    id: "animation",
    label: "Animation",
    blurb: "Drawn, modelled and stop-motion — not only for children.",
    leadGenre: "Animation",
    params: { with_genres: "16", "vote_count.gte": "800" },
    tv: { params: { with_genres: "16", "vote_count.gte": "200" }, minVotes: 350, leadGenre: "Animation" },
  },
  {
    id: "family",
    label: "Family",
    blurb: "Holds a room of different ages at once.",
    leadGenre: "Family",
    params: { with_genres: "10751", "vote_count.gte": "800" },
    tv: { params: { with_genres: "10751", "vote_count.gte": "200" }, minVotes: 350, leadGenre: "Family" },
  },
  {
    id: "documentary",
    label: "Documentary",
    blurb: "True, and made with the care fiction usually gets.",
    leadGenre: "Documentary",
    // Documentaries collect an order of magnitude fewer votes than features,
    // so this floor is low by design rather than by oversight.
    params: { with_genres: "99", "vote_count.gte": "200" },
    minVotes: 300,
    tv: { params: { with_genres: "99", "vote_count.gte": "50" }, minVotes: 100, leadGenre: "Documentary" },
  },

  /* ---- Keyword-led ----------------------------------------------------- *
     Narrow ideas no genre expresses. Every id below was confirmed against
     TMDB's /search/keyword, and the floors are low because the candidate pools
     are small — a 700-vote bar would leave these rails three titles long.
   * ---------------------------------------------------------------------- */
  {
    id: "political",
    label: "Political Thrillers",
    blurb: "Power, leverage, and who is really in the room.",
    // 209817 is "political thriller". The broader "politics" (6078) was tried
    // and rejected: it selects on subject matter, not on the kind of film.
    params: { with_keywords: "209817", "vote_count.gte": "150" },
    minVotes: 400,
    tv: { params: { with_keywords: "209817", "vote_count.gte": "30" }, minVotes: 80 },
  },
  {
    id: "politicaldrama",
    label: "Political Drama",
    blurb: "Campaigns, cabinets and the people inside them.",
    /*
       The companion to `political`, which selects on the kind of film. This
       selects on the subject, so an election drama, a Washington procedural or
       a statesman biopic has somewhere to go — none of them are thrillers.

       Genre 18 does real work here: the keywords alone reach documentaries and
       satires, and the pairing is what makes this "political drama" rather
       than "anything political". 298528 is the literal keyword and is far too
       narrow on its own — six films, nine series — so the campaign, election,
       president, parliament and democracy keywords widen it.

       Deliberately *not* 6078 ("politics"). It selects on subject matter alone
       and reaches Ben-Hur and Remember the Titans, which is the same failure
       the recommendation gate was built to stop.
    */
    params: {
      with_genres: "18",
      with_keywords: "298528|18075|15134|8570|6079|33640",
      "vote_count.gte": "120",
    },
    minVotes: 300,
    tv: {
      params: {
        with_genres: "18",
        with_keywords: "298528|18075|15134|8570|6079|33640",
        "vote_count.gte": "40",
        // Same anime problem as `spy` — see the note there.
        without_genres: "16",
      },
      minVotes: 80,
    },
  },
  {
    id: "spy",
    label: "Spies & Espionage",
    blurb: "Tradecraft, cover stories, and nobody saying what they mean.",
    // Both ids: "spy" (470) is the popular framing, "espionage" (5265) the
    // sober one, and neither alone covers the field.
    params: { with_keywords: "470|5265", "vote_count.gte": "400" },
    minVotes: 600,
    /*
       Animation excluded on the TV side only. The keyword is dominated there
       by anime — Spy x Family and its neighbours outrank every live-action
       series on rating, and this app has a whole Anime tab for them.
    */
    tv: { params: { with_keywords: "470|5265", "vote_count.gte": "60", without_genres: "16" }, minVotes: 120 },
  },
  {
    id: "truestory",
    label: "Based on a True Story",
    blurb: "It happened. The film is the argument about how.",
    params: { with_keywords: "9672", "vote_count.gte": "400" },
    tv: { params: { with_keywords: "9672", "vote_count.gte": "80", without_genres: "16" }, minVotes: 150 },
  },
  {
    id: "survival",
    label: "Survival",
    blurb: "Someone against the situation, with the clock running.",
    params: { with_keywords: "10349", "vote_count.gte": "400" },
    // Same anime problem as `spy` — see the note there.
    tv: { params: { with_keywords: "10349", "vote_count.gte": "60", without_genres: "16" }, minVotes: 120 },
  },
  {
    id: "courtroom",
    label: "Courtroom",
    blurb: "The case, the cross-examination, and the cost of winning.",
    // "courtroom" (33519), "legal drama" (222517) and "legal thriller"
    // (254459) — TMDB spreads the same idea across all three.
    params: { with_keywords: "33519|222517|254459", "vote_count.gte": "250" },
    minVotes: 400,
    tv: { params: { with_keywords: "33519|222517|254459", "vote_count.gte": "50" }, minVotes: 100 },
  },
];

export function findMood(id: string): Mood | undefined {
  return MOODS.find((m) => m.id === id);
}

/** The moods that mean something for this catalogue. */
export function moodsFor(kind: MediaKind): Mood[] {
  return kind === "movie" ? MOODS : MOODS.filter((m) => m.tv !== null);
}

/** The discover params and thresholds a mood should run with for this kind. */
export function moodQuery(mood: Mood, kind: MediaKind) {
  if (kind === "movie" || !mood.tv) {
    return {
      params: mood.params,
      minVotes: mood.minVotes ?? 800,
      floor: mood.floor ?? 6.6,
      leadGenre: mood.leadGenre,
    };
  }
  return {
    params: mood.tv.params,
    minVotes: mood.tv.minVotes ?? 250,
    floor: mood.tv.floor ?? mood.floor ?? 6.6,
    // Television names the same idea differently — Action & Adventure for
    // Action, Sci-Fi & Fantasy for Science Fiction — so it carries its own.
    leadGenre: mood.tv.leadGenre,
  };
}

export const ANIME_FILTER = {
  with_genres: "16",
  with_original_language: "ja",
} as const;
