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
 * A snapshot of one account's library.
 *
 * `inLibrary` is what the account actually holds right now; `known` is every
 * row Stremio still stores for it, deletions included. They are kept apart
 * because they answer different questions — see `fetchLibrarySnapshot`.
 */
export interface LibrarySnapshot {
  inLibrary: Set<string>;
  known: Set<string>;
}

export function emptySnapshot(): LibrarySnapshot {
  return { inLibrary: new Set(), known: new Set() };
}

export function mergeSnapshots(snapshots: LibrarySnapshot[]): LibrarySnapshot {
  const merged = emptySnapshot();
  for (const snap of snapshots) {
    for (const id of snap.inLibrary) merged.inLibrary.add(id);
    for (const id of snap.known) merged.known.add(id);
  }
  return merged;
}

interface RemoteLibraryItem {
  _id?: string;
  removed?: boolean;
}

/**
 * Reads an account's library and splits it into what is still in it and what
 * it has ever held.
 *
 * Stremio deletes are soft: removing a title in the app flips `removed` to
 * true and pushes the same row back with a fresh `_mtime`, and the server
 * keeps that row for a year (stremio-core `LibraryItem::should_sync`). So
 * `datastoreMeta`, which returns one `[id, mtime]` pair per stored row, still
 * lists everything the user deleted. Reading ids from it — which is what this
 * did — meant a title deleted in Stremio kept its "In Library" badge here
 * forever and was skipped by every later sync as already present.
 *
 * `datastoreGet` returns the rows themselves, so `removed` is readable and the
 * two sets can be told apart:
 *
 *   - `inLibrary` drives the badges. It matches what Stremio's own Library
 *     board shows, which is `!removed` (`LibraryFilter::NotRemoved`).
 *   - `known` is every id including the removed ones, and drives sync's skip
 *     logic, so a title the user deliberately deleted is not resurrected by
 *     the next merge of the IMDb list it came from.
 */
export async function fetchLibrarySnapshot(authKey: string): Promise<LibrarySnapshot> {
  try {
    const data = await call<{ result?: RemoteLibraryItem[] } & StremioError>("datastoreGet", {
      authKey,
      collection: "libraryItem",
      ids: [],
      all: true,
    });
    if (data.error) throw new Error(data.error.message);

    const snapshot = emptySnapshot();
    for (const row of data.result ?? []) {
      const id = row?._id;
      if (typeof id !== "string" || !id) continue;
      snapshot.known.add(id);
      // `temp` rows are the ones Stremio creates just from pressing play; they
      // carry `removed: true` until the title is explicitly added, so the
      // `removed` check covers them on its own.
      if (row.removed !== true) snapshot.inLibrary.add(id);
    }
    return snapshot;
  } catch {
    // An empty snapshot leaves badges off and lets sync write, which is the
    // safe way to be wrong: nothing is claimed to be in a library we could not
    // read. Deliberately no `datastoreMeta` fallback — it cannot see deletions.
    return emptySnapshot();
  }
}

/**
 * Library item payload. Field-for-field the shape the legacy app used
 * (index.html:4326) — Stremio is picky about this, so it is not "tidied up".
 */
function libraryItem(
  id: string,
  name: string,
  type: MediaKind,
  poster: string,
  removed = false,
) {
  const nowIso = new Date().toISOString();
  return {
    _id: id,
    name,
    type,
    poster,
    posterShape: "poster",
    removed,
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

/**
 * Removes a title from every connected account, the way Stremio itself does.
 *
 * There is no delete in this API. Stremio removes a title by writing the same
 * row back with `removed: true` — see `fetchLibrarySnapshot` — so that is what
 * this does, and it is why a removal here shows up in the app rather than
 * being quietly undone by the next sync from another device.
 *
 * The existing row is read first so the flag is flipped on the real thing.
 * `state` carries watch progress, `timesWatched` and `lastWatched`; writing a
 * freshly built row instead would silently reset all of it, so a title removed
 * from a shelf and later re-added would come back claiming it had never been
 * played. The synthesized row is only the fallback for a row we couldn't read.
 */
export async function removeFromLibrary(
  item: { imdbId?: string; title: string; kind: MediaKind; poster?: string },
  authKeys: string[],
): Promise<{ ok: number; failed: number }> {
  const id = item.imdbId;
  if (!id) {
    throw new Error("This title has no IMDb ID, so it was never in a Stremio library.");
  }

  let ok = 0;
  let failed = 0;

  for (const authKey of authKeys) {
    try {
      const existing = await call<{ result?: Record<string, unknown>[] } & StremioError>(
        "datastoreGet",
        { authKey, collection: "libraryItem", ids: [id], all: false },
      );

      const row = existing.result?.[0];
      const payload = row
        ? { ...row, removed: true, _mtime: new Date().toISOString() }
        : libraryItem(id, item.title, item.kind, item.poster || metahubPoster(id), true);

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
