"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "@/lib/useSession";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { clearFavourite, fetchFavourites, setFavourite, toSavedTitle } from "@/lib/lists";
import type { Favourite } from "@/lib/lists";
import type { MediaItem, MediaKind, SearchResults } from "@/lib/types";
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

  const choose = async (rank: number, item: MediaItem) => {
    let title;
    try {
      title = toSavedTitle(item);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That title can't be saved.");
      return;
    }

    setBusy(true);
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
            <div
              key={rank}
              className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-container"
            >
              <PosterImage
                src={pick.poster ?? metahubPoster(pick.imdbId)}
                alt={pick.title}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 font-label-md text-[12px] text-primary backdrop-blur-md">
                {rank}
              </span>
              <button
                type="button"
                onClick={() => void clear(rank)}
                aria-label={`Remove ${pick.title} from ${heading}`}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1.5 text-white opacity-0 backdrop-blur-md transition-all duration-200 hover:bg-error hover:text-on-error focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
              <div className="poster-overlay absolute inset-0 flex items-end p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="truncate font-label-md text-[12px] text-on-surface">
                  {pick.title}
                </span>
              </div>
            </div>
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
  busy,
  onPick,
}: {
  kind: MediaKind;
  rank: number;
  busy: boolean;
  onPick: (item: MediaItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading } = useFetch<SearchResults>(
    debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );

  const results = (data?.titles ?? []).filter((t) => t.kind === kind).slice(0, 12);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-surface-container/60 p-4">
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
              key={item.key}
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
