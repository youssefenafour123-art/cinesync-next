import type { MediaItem, MediaKind, SyncItem } from "./types";

/**
 * Browser-side helpers. Everything goes through /api/stremio/<method>, which
 * relays to api.strem.io with the Origin header it demands.
 *
 * The legacy UI posted to bare /api/datastorePut and /api/datastoreMeta, which
 * the old server never routed — every sync call 404'd. Hence the single
 * `call()` helper below: there is now exactly one place the path is built.
 */
async function call<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/stremio/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected response from ${method}: ${text.slice(0, 120)}`);
  }
}

interface StremioError {
  error?: { message?: string };
}

export interface LoginResult extends StremioError {
  result?: { authKey?: string; user?: { email?: string } };
}

export async function login(email: string, password: string): Promise<string> {
  const data = await call<LoginResult>("login", { email, password });
  const authKey = data.result?.authKey;
  if (!authKey) {
    throw new Error(data.error?.message || "Login failed. Check your credentials.");
  }
  return authKey;
}

/**
 * IDs already present in an account's library — drives both the sync skip
 * logic and the "In Library" badge.
 *
 * `datastoreMeta` returns rows as `[id, mtime]` pairs, not objects. The legacy
 * code did `result.map(i => i._id)`, which yields `undefined` for every row;
 * because sync never worked at all, that was never caught. Both shapes are
 * handled here so a Stremio response-format change can't silently empty the set.
 */
export async function fetchLibraryIds(authKey: string): Promise<Set<string>> {
  try {
    const data = await call<
      { result?: (string | [string, unknown] | { _id?: string })[] } & StremioError
    >("datastoreMeta", { authKey, collection: "libraryItem" });

    const ids = new Set<string>();
    for (const row of data.result ?? []) {
      if (typeof row === "string") ids.add(row);
      else if (Array.isArray(row)) {
        if (typeof row[0] === "string") ids.add(row[0]);
      } else if (row && typeof row._id === "string") ids.add(row._id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

/**
 * Library item payload. Field-for-field the shape the legacy app used
 * (index.html:4326) — Stremio is picky about this, so it is not "tidied up".
 */
function libraryItem(id: string, name: string, type: MediaKind, poster: string) {
  const nowIso = new Date().toISOString();
  return {
    _id: id,
    name,
    type,
    poster,
    posterShape: "poster",
    removed: false,
    temp: false,
    _ctime: nowIso,
    _mtime: nowIso,
    state: {
      lastWatched: nowIso,
      timeWatched: 0,
      timeOffset: 0,
      overallTimeWatched: 0,
      timesWatched: 0,
      flaggedWatched: 0,
      duration: 0,
      video_id: null,
      watched: null,
      noNotif: false,
    },
    behaviorHints: {
      defaultVideoId: id,
      featuredVideoId: null,
      hasScheduledVideos: false,
    },
  };
}

export function metahubPoster(imdbId: string): string {
  return `https://images.metahub.space/poster/small/${imdbId}/img`;
}

export async function putSyncItem(item: SyncItem, authKey: string): Promise<void> {
  const payload = libraryItem(item.id, item.title, item.type, metahubPoster(item.id));
  const data = await call<StremioError>("datastorePut", {
    authKey,
    collection: "libraryItem",
    changes: [payload],
  });
  if (data.error) throw new Error(data.error.message || "datastorePut rejected the item");
}

/**
 * Adds a browsed title to every connected account.
 * Needs an IMDb id — Stremio libraries are keyed by it.
 */
export async function addToLibrary(
  item: MediaItem,
  authKeys: string[],
): Promise<{ ok: number; failed: number }> {
  if (!item.imdbId) {
    throw new Error("This title has no IMDb ID, so Stremio can't store it.");
  }

  const payload = libraryItem(
    item.imdbId,
    item.title,
    item.kind,
    item.poster || metahubPoster(item.imdbId),
  );

  let ok = 0;
  let failed = 0;

  for (const authKey of authKeys) {
    try {
      const data = await call<StremioError>("datastorePut", {
        authKey,
        collection: "libraryItem",
        changes: [payload],
      });
      if (data.error) failed++;
      else ok++;
    } catch {
      failed++;
    }
  }

  return { ok, failed };
}
