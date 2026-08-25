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
 * The last title an account actually played.
 *
 * For a series this is the show, not the episode: Stremio keys the row by the
 * series id and records which episode you were on in `state.video_id`, and
 * "more like this" is a question about the show.
 */
export interface WatchedTitle {
  imdbId: string;
  title: string;
  kind: MediaKind;
  poster?: string;
  /** `state.lastWatched` as a timestamp, so two accounts can be compared. */
  watchedAt: number;
}

/**
 * A snapshot of one account's library.
 *
 * `inLibrary` is what the account actually holds right now; `known` is every
 * row Stremio still stores for it, deletions included. They are kept apart
 * because they answer different questions — see `fetchLibrarySnapshot`.
 */
/**
 * One title as it sits in a Stremio library.
 *
 * The snapshot used to reduce every row to an id, which is all a badge needs
 * and useless for showing someone their library. The name and the poster were
 * in the response the whole time and were being thrown away.
 */
export interface LibraryEntry {
  imdbId: string;
  title: string;
  kind: MediaKind;
  poster?: string;
}

export interface LibrarySnapshot {
  inLibrary: Set<string>;
  known: Set<string>;
  /** The most recently played row, if the account has ever played anything. */
  lastWatched?: WatchedTitle;
  /**
   * Everything in the library proper, for rendering it.
   *
   * Optional so a caller that only recomputes membership — `useSync` does —
   * can leave it alone rather than clearing it by omission.
   */
  items?: LibraryEntry[];
}

export function emptySnapshot(): LibrarySnapshot {
  return { inLibrary: new Set(), known: new Set() };
}

export function mergeSnapshots(snapshots: LibrarySnapshot[]): LibrarySnapshot {
  const merged = emptySnapshot();
  for (const snap of snapshots) {
    for (const id of snap.inLibrary) merged.inLibrary.add(id);
    for (const id of snap.known) merged.known.add(id);
    // Across several connected accounts, the genuinely most recent play wins.
    if (snap.lastWatched && (!merged.lastWatched || snap.lastWatched.watchedAt > merged.lastWatched.watchedAt)) {
      merged.lastWatched = snap.lastWatched;
    }

    /*
       Deduplicated by id, first account wins.

       Two connected accounts commonly hold the same film, and the entry is
       only a poster and a title — whichever copy is shown is the same title.
       Keeping both would render it twice under the same React key.
    */
    for (const entry of snap.items ?? []) {
      (merged.items ??= []).push(entry);
    }
  }

  if (merged.items) {
    const seen = new Set<string>();
    merged.items = merged.items.filter((e) => !seen.has(e.imdbId) && seen.add(e.imdbId));
    merged.items.sort((a, b) => a.title.localeCompare(b.title));
  }

  return merged;
}

interface RemoteState {
  lastWatched?: string | null;
  timeOffset?: number;
  timeWatched?: number;
  overallTimeWatched?: number;
  timesWatched?: number;
  flaggedWatched?: number;
}

interface RemoteLibraryItem {
  _id?: string;
  removed?: boolean;
  name?: string;
  type?: string;
  poster?: string;
  state?: RemoteState;
}

/**
 * Whether a row records a title someone actually played.
 *
 * `state.lastWatched` alone does not, and trusting it is how this feature gets
 * silently wrong: `libraryItem()` below stamps `lastWatched` with the current
 * time on every write, so adding a title from CineSync — or a bulk IMDb sync
 * writing hundreds of them — would each claim to be the last thing watched.
 * A real play always moves at least one of the counters.
 */
function watchedFrom(row: RemoteLibraryItem): WatchedTitle | null {
  const id = row._id;
  const state = row.state;
  if (!state || typeof id !== 'string' || !/^tt\d+$/.test(id)) return null;

  const played =
    (state.timeOffset ?? 0) > 0 ||
    (state.timeWatched ?? 0) > 0 ||
    (state.overallTimeWatched ?? 0) > 0 ||
    (state.timesWatched ?? 0) > 0 ||
    (state.flaggedWatched ?? 0) > 0;
  if (!played) return null;

  const watchedAt = state.lastWatched ? Date.parse(state.lastWatched) : NaN;
  if (!Number.isFinite(watchedAt) || watchedAt <= 0) return null;

  return {
    imdbId: id,
    title: row.name || id,
    kind: row.type === 'series' ? 'series' : 'movie',
    poster: row.poster || undefined,
    watchedAt,
  };
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
      if (row.removed !== true) {
        snapshot.inLibrary.add(id);

        // Same row, same loop, no extra request — the name and poster are
        // right here, and this is the only place they exist.
        (snapshot.items ??= []).push({
          imdbId: id,
          title: row.name || id,
          kind: row.type === "series" ? "series" : "movie",
          poster: row.poster || undefined,
        });
      }

      /*
         Watch state, read from the same rows rather than a second request.
         A title played but never added is a `temp` row — `removed: true` — so
         this deliberately runs *outside* the `removed` check above: the last
         thing you watched usually isn't in your library at all.
      */
      const watched = watchedFrom(row);
      if (watched && (!snapshot.lastWatched || watched.watchedAt > snapshot.lastWatched.watchedAt)) {
        snapshot.lastWatched = watched;
      }
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
