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
  cast?: string[];
  trailers?: { source?: string; type?: string }[];
}

function toMediaItem(meta: CinemetaMeta, kind: MediaKind): MediaItem {
  const trailer =
    meta.trailers?.find((t) => t.type === "Trailer" && t.source) ?? meta.trailers?.[0];

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
    director: meta.director?.join(", "),
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

/** Just the IMDb rating — used to upgrade TMDB's vote_average where possible. */
export async function fetchImdbRating(
  kind: MediaKind,
  imdbId: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(`${BASE}/meta/${kind}/${imdbId}.json`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { meta?: CinemetaMeta };
    return data.meta?.imdbRating;
  } catch {
    return undefined;
  }
}
