"use client";

import { useEffect, useMemo, useState } from "react";
import type { RuntimesPayload, TitleRuntime } from "@/app/api/runtimes/route";
import type { SavedTitle } from "./lists";
import { useWatched } from "./useWatched";
import { useAppStore } from "@/store/useAppStore";

/**
 * How long this account has spent watching, from both of the things it knows.
 *
 * The profile used to answer this with one number: `overallTimeWatched`, summed
 * across every row of every connected Stremio library. That is a measured
 * figure and it stays the backbone of the card — but it left the app's own
 * Watched list out of its own headline statistic. Marking a series watched here
 * moved the "Watched" counter and nothing else, so the figure people actually
 * read sat still while they told the app they had seen a seventy-hour show.
 *
 * So there are two parts now, and they are kept apart all the way to the card:
 *
 *   - **played** — Stremio's own counter. Real milliseconds, nothing inferred.
 *   - **marked** — titles the viewer ticked on CineSync, priced at their
 *     published length: a film's runtime, a series' full run.
 *
 * The second is an estimate and the card says so. It is a defensible one —
 * "I watched this" does mean the whole thing — but it is not the same kind of
 * fact as the first, and this app has been careful about that distinction
 * since the profile was built.
 *
 * ## Nothing is counted twice
 *
 * The Watched list is not disjoint from Stremio: `useWatchedSync` pours what
 * Stremio finished straight into it, so most of the list is usually already
 * inside `watchedMs`. Every id a connected player has measured any playback
 * for — `playedIds`, finished or abandoned — is therefore dropped before
 * anything is priced. What is left is what only CineSync knows about.
 */
export interface WatchTime {
  /** Played plus marked, in milliseconds. What the card leads with. */
  ms: number;
  /** Milliseconds a connected player actually measured. */
  playedMs: number;
  /** Milliseconds estimated from titles marked watched here. */
  markedMs: number;
  /** Episodes finished: Stremio's completions plus the runs that were marked. */
  episodes: number;
  /** How many marked titles are behind `markedMs`. */
  markedTitles: number;
  /** False while a newly marked title's length is still being looked up. */
  settled: boolean;
}

/**
 * Lengths already looked up, by IMDb id, for the lifetime of the page.
 *
 * `null` means "asked, and TMDB had no answer" — a series with no episode
 * runtime on record, most often. Remembering the misses matters as much as the
 * hits: without it every visit to the profile would re-ask for the same
 * unanswerable titles, and the profile is a tab people come back to.
 */
const lengths = new Map<string, TitleRuntime | null>();

/** Ids currently being asked about, so two mounts don't ask twice. */
const asking = new Set<string>();

const subscribers = new Set<() => void>();
function publish() {
  for (const fn of subscribers) fn();
}

/**
 * Ids per request.
 *
 * The route caps at 120 and one URL carrying ninety IMDb ids is already close
 * to what proxies are happy to forward, so a long list goes in chunks. They
 * run one after another rather than at once: each id can cost TMDB two calls
 * on a cold cache, and a hundred of those in parallel is how a rate limit is
 * found.
 */
const CHUNK = 40;

async function lookUp(refs: SavedTitle[]): Promise<void> {
  const wanted = refs.filter((t) => !lengths.has(t.imdbId) && !asking.has(t.imdbId));
  if (wanted.length === 0) return;

  for (const t of wanted) asking.add(t.imdbId);

  try {
    for (let i = 0; i < wanted.length; i += CHUNK) {
      const chunk = wanted.slice(i, i + CHUNK);
      const ids = chunk
        .map((t) => [t.imdbId, t.kind, t.tmdbId ?? ""].filter(Boolean).join(":"))
        .join(",");

      let runtimes: TitleRuntime[] = [];
      try {
        const res = await fetch(`/api/runtimes?ids=${encodeURIComponent(ids)}`);
        if (res.ok) ({ runtimes } = (await res.json()) as RuntimesPayload);
      } catch {
        // Offline, or the route refused. The titles in this chunk stay
        // unrecorded below and will be asked for again on the next visit,
        // which is the right outcome for a failure that may not repeat.
      }

      const found = new Map(runtimes.map((r) => [r.imdbId, r]));
      for (const t of chunk) lengths.set(t.imdbId, found.get(t.imdbId) ?? null);
      publish();
    }
  } finally {
    for (const t of wanted) asking.delete(t.imdbId);
    publish();
  }
}

export function useWatchTime(): WatchTime {
  const watched = useWatched();
  const playedIds = useAppStore((s) => s.playedIds);
  const playedMs = useAppStore((s) => s.watchedMs);
  const stremioEpisodes = useAppStore((s) => s.episodesWatched);

  /*
     Bumped whenever a lookup writes into `lengths`.

     Kept as a value rather than a bare re-render nudge because the sum below
     is memoised: a re-render alone would recompute nothing, and the figure
     would sit at whatever it was when the last dependency changed.
  */
  const [version, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  /*
     What the app knows about that Stremio does not.

     Ordered by id rather than left in list order, so the dependency below is
     stable: `watched.items` is rebuilt on every publish and moving one title
     to the front of it must not re-fire a lookup for the other ninety.
  */
  const mine = useMemo(
    () =>
      watched.items
        .filter((t) => t.imdbId && !playedIds.has(t.imdbId))
        .sort((a, b) => a.imdbId.localeCompare(b.imdbId)),
    [watched.items, playedIds],
  );

  const key = useMemo(() => mine.map((t) => t.imdbId).join(","), [mine]);

  useEffect(() => {
    if (mine.length === 0) return;
    void lookUp(mine);
    // `key` is the identity of `mine` — see the sort above. Depending on the
    // array itself would re-run this on every publish from the watched store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    let markedMs = 0;
    let markedTitles = 0;
    let markedEpisodes = 0;
    let settled = true;

    for (const t of mine) {
      const known = lengths.get(t.imdbId);
      if (known === undefined) {
        settled = false;
        continue;
      }
      // `null` is a title TMDB could not price. It is not pending and it is
      // not zero minutes — it simply does not appear in the figure.
      if (!known) continue;
      markedMs += known.minutes * 60_000;
      markedTitles += 1;
      markedEpisodes += known.episodes ?? 0;
    }

    return {
      ms: playedMs + markedMs,
      playedMs,
      markedMs,
      episodes: stremioEpisodes + markedEpisodes,
      markedTitles,
      settled,
    };
    // `version` is how a filled entry in `lengths` reaches this — the map is
    // module state and nothing else here would tell React it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mine, playedMs, stremioEpisodes, version]);
}
