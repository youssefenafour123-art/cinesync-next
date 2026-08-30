import "server-only";
import type { MediaItem, MediaKind } from "./types";

const BASE = "https://v3-cinemeta.strem.io";

/** Raw Cinemeta meta shape — only the fields we consume. */
interface CinemetaMeta {
  id: string;
  name: string;
  type?: string;
  poster?: string;
  background?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  runtime?: string;
  genres?: string[];
  director?: string[];
  writer?: string[];
  cast?: string[];
  trailers?: { source?: string; type?: string }[];
  /** Series only. One entry per episode Cinemeta knows about. */
  videos?: { season?: number; episode?: number }[];
}

function toMediaItem(meta: CinemetaMeta, kind: MediaKind): MediaItem {
  const trailer =
    meta.trailers?.find((t) => t.type === "Trailer" && t.source) ?? meta.trailers?.[0];

  /*
     Episode totals from the video list.

     Cinemeta ships one `videos` entry per episode, so counting them is the
     whole calculation. Season 0 is excluded on purpose — that is where
     specials, recaps and OVAs live, and nobody describing a show's length
     counts them. TMDB's own totals are preferred where both exist (see
     `/api/enrich`); this is the fallback for a title TMDB cannot match.
  */
  const episodes = kind === "series" ? (meta.videos ?? []).filter((v) => (v.season ?? 0) > 0) : [];
  const seasonCount = episodes.length
    ? new Set(episodes.map((v) => v.season)).size
    : undefined;

  return {
    key: meta.id,
    imdbId: meta.id?.startsWith("tt") ? meta.id : undefined,
    title: meta.name,
    kind,
    poster: meta.poster,
    backdrop: meta.background,
    year: meta.releaseInfo ? String(meta.releaseInfo).split(/[–-]/)[0] : undefined,
    rating: meta.imdbRating,
    description: meta.description,
    runtime: meta.runtime,
    genres: meta.genres,
    /*
       Cinemeta's `director` is IMDb's, which is right for a film and misleading
       for a series — on a show it is whoever directed some episode, not the
       person whose show it is. So it is only carried for films; TMDB's
       `created_by` answers the question for television. See `enrich` in tmdb.ts.
    */
    director: kind === "movie" && meta.director?.length ? meta.director.join(", ") : undefined,
    directorLabel:
      kind === "movie" && meta.director?.length
        ? meta.director.length > 1
          ? "Directors"
          : "Director"
        : undefined,
    /*
       IMDb's writing credit, straight through. Unlike `director` this is
       carried for both kinds: IMDb credits a series to the people who wrote
       it, which is the question being asked, rather than to whoever happened
       to direct one episode.
    */
    writer: meta.writer?.length ? meta.writer.slice(0, 4).join(", ") : undefined,
    writerLabel: meta.writer?.length ? (meta.writer.length > 1 ? "Writers" : "Writer") : undefined,
    seasonCount,
    episodeCount: episodes.length || undefined,
    cast: meta.cast?.slice(0, 6).join(", "),
    trailerKey: trailer?.source,
  };
}

/**
 * Top catalog for a kind. Revalidated hourly so a tab switch is one cached
 * request instead of the legacy app's per-card fan-out.
 */
export async function fetchTopCatalog(kind: MediaKind): Promise<MediaItem[]> {
  try {
    const res = await fetch(`${BASE}/catalog/${kind}/top.json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { metas?: CinemetaMeta[] };
    return (data.metas ?? []).filter((m) => m.poster).map((m) => toMediaItem(m, kind));
  } catch {
    return [];
  }
}

/** Full meta for one title — powers the details modal and the trailer lookup. */
export async function fetchMeta(kind: MediaKind, imdbId: string): Promise<MediaItem | null> {
  try {
    const res = await fetch(`${BASE}/meta/${kind}/${imdbId}.json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { meta?: CinemetaMeta };
    return data.meta ? toMediaItem(data.meta, kind) : null;
  } catch {
    return null;
  }
}

/**
 * Whether Stremio's own catalogue actually knows this title.
 *
 * The point of the check is the "Add to Library" button. Writing to a Stremio
 * library is writing an IMDb id into the user's datastore, and Stremio resolves
 * that id through Cinemeta when it renders the library. An id TMDB knows but
 * Cinemeta does not produces a row the user cannot open or play — which is a
 * worse outcome than simply not recommending the title. This is most likely to
 * bite exactly where the catalogue is thinnest, which is regional cinema.
 *
 * Cached for a day: whether Cinemeta carries a title changes rarely, and the
 * Arabic rails would otherwise re-ask on every revalidation.
 */
export async function existsInCinemeta(kind: MediaKind, imdbId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/meta/${kind}/${imdbId}.json`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { meta?: CinemetaMeta };
    return Boolean(data.meta?.id);
  } catch {
    return false;
  }
}

/**
 * Minutes out of a Cinemeta runtime string.
 *
 * The field is IMDb's, formatted for a reader rather than for arithmetic, and
 * it arrives in more than one shape: "142 min" for most things, "1h 30min" for
 * some, and occasionally with a stray character in it — Fullmetal Alchemist:
 * Brotherhood comes back "54S min". So the hours-and-minutes form is matched
 * first and anything else falls back to the leading number, which is right for
 * every one of those.
 */
export function runtimeMinutes(raw?: string): number | undefined {
  if (!raw) return undefined;

  const hoursAndMinutes = /(\d+)\s*h(?:\s*(\d+)\s*m)?/i.exec(raw);
  if (hoursAndMinutes) {
    return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] ?? 0);
  }

  const minutes = /(\d+)/.exec(raw);
  return minutes ? Number(minutes[1]) : undefined;
}

/**
 * How long one episode of a series is — or one film, where TMDB has no answer.
 *
 * This exists because TMDB's `episode_run_time` is empty for a great many
 * shows: Game of Thrones, Stranger Things and Better Call Saul all come back
 * with `[]`. The only other number on that response is `last_episode_to_air`,
 * and using it is worse than having nothing — finales run long, so it priced
 * Game of Thrones at 80 minutes an episode against a real 57, and Stranger
 * Things at 129 against 65. Cinemeta carries IMDb's own per-episode runtime
 * and gets all three right.
 *
 * Cached for a day, and against the same URL `fetchImdbRating` uses with the
 * same revalidation — so a title already enriched costs nothing to price.
 */
/**
 * How long one request in a bulk build may take before it is abandoned.
 *
 * A rail is ~35 requests behind one `Promise.all`, so the slowest of them
 * decides when the page appears — a single straggler was turning a 0.2 second
 * build into a five second one, and it was a different genre every time.
 *
 * Set against the median rather than against patience. TMDB and Cinemeta both
 * answer in about 25 ms and the slowest of thirty-two in about 200; this is
 * roughly fifty times the median, so anything it cuts off was never going to
 * arrive in a useful time. The first attempt at this was 2500 ms, which was
 * long enough that `Server-Timing` on the deployment still showed whole slices
 * pricing at 3 seconds — the leash, not the request, was the wait. `enrich`
 * makes two of these in sequence, so the worst a title can cost is twice this.
 *
 * Nothing is lost when it fires. `enrich` keeps the list item it started with,
 * so an abandoned detail request costs the community poster and the US release
 * day, and an abandoned rating lookup leaves TMDB's own average in place — the
 * field the IMDb rating exists to improve on, not one that goes missing.
 *
 * Declared here rather than in lib/tmdb.ts because that module imports this
 * one, and a constant both need has to travel in that direction.
 */
export const BULK_TIMEOUT_MS = 1200;

export async function fetchRuntimeMinutes(
  kind: MediaKind,
  imdbId: string,
): Promise<number | undefined> {
  try {
    const res = await fetch(`${BASE}/meta/${kind}/${imdbId}.json`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { meta?: CinemetaMeta };
    return runtimeMinutes(data.meta?.runtime);
  } catch {
    return undefined;
  }
}

/** Just the IMDb rating — used to upgrade TMDB's vote_average where possible. */
export async function fetchImdbRating(
  kind: MediaKind,
  imdbId: string,
  /**
   * One of thirty-two, inside a caller that caches the finished rail. Skips
   * the data cache and gives up after a moment rather than holding the batch —
   * see `BULK_TIMEOUT_MS` in lib/tmdb.ts. Losing this leaves TMDB's own
   * average in place, which is the field it exists to improve on.
   */
  bulk = false,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${BASE}/meta/${kind}/${imdbId}.json`,
      bulk
        ? { cache: "no-store", signal: AbortSignal.timeout(BULK_TIMEOUT_MS) }
        : { next: { revalidate: 86400 } },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { meta?: CinemetaMeta };
    return data.meta?.imdbRating;
  } catch {
    return undefined;
  }
}
