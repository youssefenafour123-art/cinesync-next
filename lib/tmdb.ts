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

interface TmdbDetail {
  runtime?: number;
  /** Series only. The people who actually created the show. */
  created_by?: { id?: number; name?: string; profile_path?: string | null }[];
  episode_run_time?: number[];
  genres?: { name: string }[];
  credits?: {
    crew?: { id?: number; job?: string; name?: string; profile_path?: string | null }[];
    cast?: { id?: number; name?: string; character?: string; profile_path?: string | null }[];
  };
  videos?: { results?: { site?: string; type?: string; key?: string }[] };
  images?: { posters?: { iso_639_1: string | null; file_path: string; vote_average: number }[] };
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
    backdrop: raw.backdrop_path ? `${IMG}/original${raw.backdrop_path}` : undefined,
    year: date ? date.slice(0, 4) : undefined,
    releaseDate: formatDate(date) ?? "TBA",
    rating: raw.vote_average ? raw.vote_average.toFixed(1) : undefined,
    voteCount: raw.vote_count,
    description: raw.overview || undefined,
  };
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
      append_to_response: "credits,videos,images,external_ids",
      include_image_language: "null,en",
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
    item.cast = castList.slice(0, 3).map((c) => c.name).filter(Boolean).join(", ") || undefined;

    // Keep ids alongside names so the details modal can open a profile.
    // Directors and writers first — they're what people look up.
    const KEY_CREW = /^(Director|Screenplay|Writer|Story|Creator)$/;
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

    // Prefer the best-voted textless poster — that's the look the design wants.
    const textless = (detail.images?.posters ?? []).filter((p) => p.iso_639_1 === null);
    if (textless.length) {
      textless.sort((a, b) => b.vote_average - a.vote_average);
      item.poster = `${IMG}/w500${textless[0].file_path}`;
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
}

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
  { minVotes = 500, floor = 6.5, postFloor, limit = 12, pages = 2, shortlist: shortlistSize }: CurateOptions = {},
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
  return enriched
    .filter((item) => {
      const r = parseFloat(item.rating ?? "0");
      return Number.isFinite(r) && r >= bar;
    })
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
    .slice(0, limit)
    .map((r) => r.item);
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
  return raw
    .filter((r) => r.poster_path)
    .map((r) => `${IMG}/w342${r.poster_path}`);
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

  const results = [...(first.results ?? []), ...(second.results ?? [])];

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
    upcoming: future.filter((c) => c.poster).slice(0, 12),
    filmography: released.filter((c) => c.poster).slice(0, 40),
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
}

/** Keyword ids verified against TMDB's /search/keyword endpoint. */
export const MOODS: Mood[] = [
  {
    id: "psychological",
    label: "Psychological Thrillers",
    blurb: "Tension that works on the mind rather than the pulse.",
    params: { with_genres: "53", with_keywords: "12565", "vote_count.gte": "400" },
  },
  {
    id: "novels",
    label: "Based on Novels",
    blurb: "Adaptations that earned their source material.",
    params: { with_keywords: "818", "vote_count.gte": "600" },
  },
  {
    id: "scifi",
    label: "Science Fiction",
    blurb: "Ideas first, spectacle second.",
    params: { with_genres: "878", "vote_count.gte": "800" },
  },
  {
    id: "neonoir",
    label: "Neo-Noir",
    blurb: "Moral fog, hard shadows, nobody clean.",
    params: { with_keywords: "207268", "vote_count.gte": "250" },
  },
  {
    id: "mindbenders",
    label: "Time & Memory",
    blurb: "Films that fold the timeline back on itself.",
    params: { with_keywords: "4379", "vote_count.gte": "400" },
  },
  {
    id: "heist",
    label: "Heists & Capers",
    blurb: "Plans, crews, and the moment it all goes wrong.",
    params: { with_keywords: "10051", "vote_count.gte": "300" },
  },
  {
    id: "comingofage",
    label: "Coming of Age",
    blurb: "The year everything changed.",
    params: { with_keywords: "10683", "vote_count.gte": "300" },
  },
  {
    id: "dystopia",
    label: "Dystopian Futures",
    blurb: "Tomorrow, gone wrong.",
    params: { with_keywords: "4565", "vote_count.gte": "400" },
  },
  {
    id: "crime",
    label: "Crime & Underworld",
    blurb: "Organised, personal, and rarely victimless.",
    params: { with_genres: "80", "vote_count.gte": "800" },
  },
  {
    id: "horror",
    label: "Horror That Lands",
    blurb: "Well-made frights, not cheap ones.",
    params: { with_genres: "27", "vote_count.gte": "700" },
  },
];

export function findMood(id: string): Mood | undefined {
  return MOODS.find((m) => m.id === id);
}

export const ANIME_FILTER = {
  with_genres: "16",
  with_original_language: "ja",
} as const;
