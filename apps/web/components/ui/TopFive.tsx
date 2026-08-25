"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "@/lib/useSession";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { clearFavourite, fetchFavourites, setFavourite, toSavedTitle } from "@/lib/lists";
import type { Favourite } from "@/lib/lists";
import type { MediaItem, MediaKind } from "@/lib/types";
import type { LookupPayload, LookupTitle } from "@/app/api/lookup/route";
import { metahubPoster } from "@/lib/stremio";
import { Icon } from "./Icon";
import { PosterImage } from "./PosterImage";

const RANKS = [1, 2, 3, 4, 5] as const;
const DEBOUNCE_MS = 350;

/**
 * The top five films and the top five shows.
 *
 * Two rows of five slots, because the rank *is* the identity — the primary key
 * is (user_id, kind, rank), so dropping a title into slot 3 replaces whatever
 * was in slot 3. The UI is drawn as five numbered holes rather than as a list
 * you append to, so that what the database does is what the screen shows.
 */
export function TopFive() {
  const { user } = useSession();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <TopFiveRow userId={user.id} kind="movie" heading="Top 5 Films" />
      <TopFiveRow userId={user.id} kind="series" heading="Top 5 Shows" />
    </div>
  );
}

function TopFiveRow({
  userId,
  kind,
  heading,
}: {
  userId: string;
  kind: MediaKind;
  heading: string;
}) {
  const showToast = useAppStore((s) => s.showToast);
  const [picks, setPicks] = useState<Favourite[] | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /*
     Which slot is under the pointer. Held here rather than left to
     `group-hover:` because a class cannot spring, and because the button needs
     its own press transform — which Tailwind would be fighting for if both
     were setting one.
  */
  const [hovered, setHovered] = useState<number | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    void fetchFavourites(userId, kind)
      .then((rows) => {
        if (!cancelled) setPicks(rows);
      })
      .catch(() => {
        if (!cancelled) setPicks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, kind]);

  useEffect(load, [load]);

  const choose = async (rank: number, picked: LookupTitle) => {
    setBusy(true);

    /*
       One request, for the one title actually chosen.

       A saved title has to carry an IMDb id — it is the key everything joins
       on — and `/api/lookup` does not return one, because finding it is the
       expensive half of `/api/search`. Resolving it here pays that cost once
       on a click, instead of twenty-four times on every keystroke.
    */
    let title;
    try {
      const res = await fetch(`/api/enrich?tmdb=${picked.tmdbId}&kind=${picked.kind}`);
      if (!res.ok) throw new Error("Couldn't load that title.");
      title = toSavedTitle((await res.json()) as MediaItem);
    } catch (err) {
      setBusy(false);
      showToast(err instanceof Error ? err.message : "That title can't be saved.");
      return;
    }

    try {
      await setFavourite(kind, rank, title);
      /*
         Written into the slot locally rather than refetched. The write is an
         upsert on (user_id, kind, rank), so the row that comes back is the one
         just sent — a second round trip to learn that would only add latency
         between the click and the poster appearing.
      */
      setPicks((prev) => [
        ...(prev ?? []).filter((p) => p.rank !== rank),
        { ...title, rank },
      ]);
      setPicking(null);
    } catch (err) {
      // The duplicate-title index has its own message worth showing verbatim.
      showToast(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async (rank: number) => {
    const before = picks;
    setPicks((prev) => (prev ?? []).filter((p) => p.rank !== rank));
    try {
      await clearFavourite(kind, rank);
    } catch (err) {
      setPicks(before);
      showToast(err instanceof Error ? err.message : "That didn't save.");
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="font-title-lg text-[17px] text-on-surface">{heading}</h4>
        {picking !== null ? (
          <button
            type="button"
            onClick={() => setPicking(null)}
            className="shrink-0 rounded-full bg-surface-container px-4 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-4">
        {RANKS.map((rank) => {
          const pick = picks?.find((p) => p.rank === rank);
          const active = picking === rank;

          if (picks === null) {
            return (
              <div key={rank} className="aspect-[2/3] animate-pulse rounded-xl bg-surface-container" />
            );
          }

          return pick ? (
            <motion.div
              key={rank}
              layout
              onHoverStart={() => setHovered(rank)}
              onHoverEnd={() => setHovered((r) => (r === rank ? null : r))}
              className={`group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-container transition-shadow ${
                active ? "ring-2 ring-primary" : ""
              }`}
            >
              <PosterImage
                src={pick.poster ?? metahubPoster(pick.imdbId)}
                alt={pick.title}
                className="h-full w-full object-cover"
              />

              {/*
                 A filled slot is a button too.

                 It had no click at all, so the only way to change a pick was a
                 remove control that appeared on hover — invisible on a
                 touchscreen and easy to miss anywhere else. Pressing the
                 poster now opens the search on that slot, and choosing
                 something replaces it, which is what the primary key
                 (user_id, kind, rank) does anyway.
              */}
              <button
                type="button"
                onClick={() => setPicking(active ? null : rank)}
                aria-label={`Replace ${pick.title} at number ${rank} in ${heading}`}
                className="absolute inset-0 z-10 flex items-end justify-center p-2 opacity-0 transition-opacity duration-200 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <span className="poster-overlay absolute inset-0" aria-hidden="true" />
                <span className="relative flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-label-md text-[12px] text-white backdrop-blur-md">
                  <Icon name="swap_horiz" className="text-[14px]" />
                  Replace
                </span>
              </button>

              <span className="pointer-events-none absolute left-3.5 top-3.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 font-label-md text-[12px] text-primary backdrop-blur-md">
                {rank}
              </span>

              {/*
                 Revealed with the Replace overlay, not sitting on the poster.

                 A permanent cross on all ten covers reads as clutter — the row
                 is a display of what someone chose, and a delete button on
                 every one of them makes it look like a management screen. It
                 fades in with the overlay above, and on a touchscreen the tap
                 that shows that overlay shows this too.
              */}
              <motion.button
                type="button"
                onClick={() => void clear(rank)}
                aria-label={`Remove ${pick.title} from ${heading}`}
                title={`Remove ${pick.title}`}
                onHoverStart={() => setHovered(rank)}
                onFocus={() => setHovered(rank)}
                onBlur={() => setHovered((r) => (r === rank ? null : r))}
                animate={
                  hovered === rank
                    ? { opacity: 1, scale: 1, y: 0 }
                    : { opacity: 0, scale: 0.4, y: -6 }
                }
                whileHover={{ scale: 1.18 }}
                whileTap={{ scale: 0.82 }}
                transition={{ type: "spring", stiffness: 520, damping: 26 }}
                className="absolute right-3.5 top-3.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white/90 ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-error hover:text-on-error hover:ring-error"
              >
                <Icon name="close" className="text-[14px]" />
              </motion.button>
            </motion.div>
          ) : (
            <button
              key={rank}
              type="button"
              onClick={() => setPicking(active ? null : rank)}
              aria-label={`Choose number ${rank} for ${heading}`}
              className={`flex aspect-[2/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed transition-colors ${
                active
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-white/15 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
              }`}
            >
              <Icon name="add" className="text-[22px]" />
              <span className="font-label-md text-[12px]">{rank}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {picking !== null ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <SlotSearch
              kind={kind}
              rank={picking}
              replacing={picks?.find((p) => p.rank === picking)?.title}
              busy={busy}
              onPick={(item) => void choose(picking, item)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Search, filtered to the one kind the row is for.
 *
 * `/api/search` is the multi-search every other search in the app uses, so the
 * filtering is done here rather than by adding a parameter to a cached route
 * that fourteen other callers share.
 */
function SlotSearch({
  kind,
  rank,
  replacing,
  busy,
  onPick,
}: {
  kind: MediaKind;
  rank: number;
  /** The title currently in this slot, when the pick will replace one. */
  replacing?: string;
  busy: boolean;
  onPick: (item: LookupTitle) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  /*
     `/api/lookup`, for the same reason Find Similar uses it: this list needs a
     poster, a year and a kind, and `/api/search` was paying a TMDB detail
     request plus a Cinemeta rating lookup per title to supply ratings nothing
     here renders.

     `toSavedTitle` needs an IMDb id, which lookup does not return — so the
     pick is resolved through `/api/enrich` on click, which is one request for
     the one title actually chosen instead of twenty-four for the ones that
     were not.
  */
  const { data, loading } = useFetch<LookupPayload>(
    debounced.length >= 2 ? `/api/lookup?q=${encodeURIComponent(debounced)}` : null,
  );

  const results = (data?.titles ?? []).filter((t) => t.kind === kind).slice(0, 12);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-surface-container/60 p-4">
      <p className="mb-3 font-label-md text-label-md text-on-surface-variant">
        {replacing ? (
          <>
            Replacing <span className="text-on-surface">{replacing}</span> at number {rank}
          </>
        ) : (
          <>Choosing number {rank}</>
        )}
      </p>
      <label className="sr-only" htmlFor={`slot-${kind}-${rank}`}>
        Search for number {rank}
      </label>
      <input
        id={`slot-${kind}-${rank}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={kind === "movie" ? "Search films…" : "Search shows…"}
        autoFocus
        className="w-full rounded-full bg-surface-container px-4 py-2.5 font-body-md text-body-md text-on-surface outline-none ring-primary/60 placeholder:text-on-surface-variant focus-visible:ring-2"
      />

      {debounced.length < 2 ? (
        <p className="pt-4 text-center font-label-md text-label-md text-on-surface-variant">
          Type at least two letters.
        </p>
      ) : loading ? (
        <p className="pulsing-text pt-4 text-center font-label-md text-label-md text-on-surface-variant">
          Searching…
        </p>
      ) : results.length === 0 ? (
        <p className="pt-4 text-center font-label-md text-label-md text-on-surface-variant">
          Nothing found for &ldquo;{debounced}&rdquo;.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {results.map((item) => (
            <button
              key={`${item.kind}:${item.tmdbId}`}
              type="button"
              onClick={() => onPick(item)}
              disabled={busy}
              title={item.title}
              className="group text-left disabled:opacity-50"
            >
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface-container">
                <PosterImage
                  src={item.poster}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <p className="mt-1.5 truncate font-label-md text-[12px] text-on-surface-variant group-hover:text-on-surface">
                {item.title}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
