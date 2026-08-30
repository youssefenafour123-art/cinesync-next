"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { SimilarPayload } from "@/app/api/similar/route";
import type { MediaItem, MediaKind } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { RailGrid } from "./RailGrid";
import { ErrorState, LoadingState } from "./States";

/** At or below this, the row is short enough that it should say why. */
const THIN = 3;

/**
 * "More like this" for one seed, in every state it can be in.
 *
 * Lifted out of `FindSimilar` so the details panel gets the same row rather
 * than a second implementation of it. Find Similar's job is choosing *which*
 * title you meant — a question the details panel has already answered, because
 * you are looking at the title. Everything after that point is this component,
 * and both callers share it: the same route, the same ordering, the same copy
 * when the pool is thin and the same admission when it is empty.
 *
 * The recommending is entirely `/api/similar`'s. Nothing here re-ranks, pads or
 * widens what comes back; doing any of those is how a "similar" row fills up
 * with titles that merely share Drama.
 */
export function SimilarRail({
  imdbId,
  tmdbId,
  kind,
  title,
  variant = "page",
}: {
  imdbId?: string;
  tmdbId?: number;
  kind: MediaKind;
  /** Shown until the route's own canonical name for the seed arrives. */
  title: string;
  /**
   * `page` is the curated tab's full-width shelf. `panel` is the same rail
   * sized for a modal column — a section heading rather than a page one, and
   * three across instead of four, because the four would be thumbnails.
   */
  variant?: "page" | "panel";
}) {
  /*
     IMDb id first, TMDB id second — and whichever is picked, it is picked from
     ids that do not change while the seed is on screen.

     `/api/similar` takes either. Preferring the IMDb one means this shares a
     cache entry with `BecauseYouWatched`, which is seeded by Stremio and can
     only ever speak IMDb ids. Find Similar's picker has no IMDb id at all — it
     reads TMDB search — so it takes the second branch, exactly as it did when
     this code lived there.
  */
  const url = imdbId
    ? `/api/similar?imdb=${encodeURIComponent(imdbId)}`
    : tmdbId
      ? `/api/similar?tmdb=${tmdbId}&kind=${kind}`
      : null;

  const { data, loading, error, reload } = useFetch<SimilarPayload>(url);

  /*
     Everything Show more has fetched, kept beside the first slice rather than
     replacing it — the route's slices are disjoint and each is ordered on its
     own, so appending is all that is needed and nothing already read moves.
  */
  const [more, setMore] = useState<{ page: number; items: MediaItem[]; hasMore: boolean } | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const showMore = useCallback(async () => {
    if (!url) return;
    const next = (more?.page ?? 1) + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetch(`${url}&page=${next}`);
      const payload = (await res.json()) as SimilarPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Couldn't load more.");
      setMore((prev) => ({
        page: next,
        items: [...(prev?.items ?? []), ...payload.items],
        hasMore: payload.hasMore,
      }));
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [more?.page, url]);

  // Nothing to ask about. A title with neither id is one that came from a
  // source we never matched, and there is no honest row to show for it.
  if (!url) return null;

  const name = data?.seed?.title || title;

  /*
     Deduped as insurance, not as a fix. `recommendationsByTmdb` guarantees
     disjoint slices, and this costs a set to make sure a repeat can never
     reach React as two children with one key.
  */
  const seenKeys = new Set<string>();
  const items = [...(data?.items ?? []), ...(more?.items ?? [])].filter((item) => {
    if (seenKeys.has(item.key)) return false;
    seenKeys.add(item.key);
    return true;
  });

  // The most recent slice knows whether another exists; `data` only ever
  // describes the first.
  const hasMore = more ? more.hasMore : Boolean(data?.hasMore);

  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (loading && !data) return <LoadingState label={`Finding titles like ${name || "that"}…`} />;

  if (items.length === 0) {
    /*
       Said plainly rather than filled in. The route's own note: where TMDB's
       pool is thin it "stops the picks being wrong, it cannot make the data
       richer" — so the honest answer to a thin pool is a short row, and to an
       empty one, this.
    */
    return (
      <p className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
        Nothing in TMDB&rsquo;s data is close enough to {name} to recommend honestly. That usually
        means it&rsquo;s obscure rather than that nothing is like it.
      </p>
    );
  }

  return (
    <SimilarResults
      name={name}
      items={items}
      variant={variant}
      onShowMore={hasMore ? showMore : undefined}
      loadingMore={loadingMore}
      moreError={moreError}
    />
  );
}

function SimilarResults({
  name,
  items,
  variant,
  onShowMore,
  loadingMore,
  moreError,
}: {
  name: string;
  items: MediaItem[];
  variant: "page" | "panel";
  /** Absent once the pool is out — see `hasMore`. */
  onShowMore?: () => void;
  loadingMore: boolean;
  moreError: string | null;
}) {
  /*
     Says what the row is, and when it is short, why.

     A row of three under a heading that promised recommendations reads as
     broken. Saying that three is all TMDB has that is close enough turns the
     same three into an answer.
  */
  const blurb =
    items.length <= THIN
      ? `Only ${items.length === 1 ? "one title is" : `${items.length} titles are`} close enough to ${name} to be worth showing — its pool on TMDB is thin.`
      : `Chosen from what people who watched ${name} went on to watch, then ordered by rating.`;

  /*
     The panel heading does not carry the name.

     On the curated page "More like Arrival" is a page heading, set large and
     mixed case. The modal's section headings are small caps with wide tracking
     — "SYNOPSIS", "GENRES" — and a film title set that way is a wall
     ("MORE LIKE THE LORD OF THE RINGS: THE FELLOWSHIP OF THE RING"). The blurb
     underneath names the seed in both variants anyway, and in the panel the
     seed is also the title you are reading.
  */
  const heading = variant === "panel" ? "More Like This" : `More like ${name}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={name}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {/*
           Never windowed. This list is an answer, ordered on purpose and grown
           by appending — a rotating window would drop the tail the moment Show
           more pushed it past `RAIL_SIZE`, and reorder what was already read.
        */}
        <RailGrid
          rail={{ title: heading, blurb, items }}
          compact={variant === "panel"}
          rotate={false}
        />

        {/*
           Ten more, read further down the same ranking rather than drawn from
           a wider pool and re-sorted, so nothing already on screen moves.

           Fetched on the press. The gate that decides who is eligible costs a
           keyword lookup per candidate, and most people are answered by the
           first ten.
        */}
        {onShowMore ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            {moreError ? (
              <p className="font-body-md text-[13px] text-error">{moreError}</p>
            ) : null}
            <button
              type="button"
              onClick={onShowMore}
              disabled={loadingMore}
              className="rounded-full border border-white/10 bg-surface-container/60 px-7 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary/40 hover:text-on-surface disabled:opacity-60"
            >
              {loadingMore ? "Finding more…" : moreError ? "Try again" : "Show more"}
            </button>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
