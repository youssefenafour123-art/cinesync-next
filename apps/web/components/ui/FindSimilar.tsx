"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { SimilarPayload } from "@/app/api/similar/route";
import type { MediaItem, SearchResults } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { RailGrid } from "./RailGrid";
import { PosterImage } from "./PosterImage";
import { Icon } from "./Icon";
import { ErrorState, LoadingState } from "./States";

const DEBOUNCE_MS = 350;
/** Candidates offered for one query. Enough to disambiguate, not a second search page. */
const CANDIDATES = 8;
/** At or below this, the row is short enough that it should say why. */
const THIN = 3;

/**
 * "More like this", for a title you type rather than one you watched.
 *
 * The recommending is entirely `/api/similar`'s, and deliberately so — that
 * route walks TMDB's behavioural ordering without re-sorting it and makes a
 * candidate earn its place on a genre that actually distinguishes something.
 * Nothing here re-ranks, pads or widens what comes back; doing any of those is
 * how a "similar" row fills up with titles that merely share Drama.
 *
 * What this component is actually responsible for is the part that can be
 * wrong: **which title you meant**. "Arrival" matches twenty-seven things on
 * TMDB — Villeneuve's, a 1996 film, a 2026 one — so seeding from the top hit
 * would produce recommendations that are confident and about the wrong film.
 * The seed is therefore always chosen explicitly and always shown.
 */
export function FindSimilar() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [seed, setSeed] = useState<MediaItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  /*
     Both requests go through `useFetch`, which is GET-only and cached by URL
     with no invalidation — exactly the shape of these two catalogue routes, and
     it means going back to a seed you already looked at is instant rather than
     a second round trip.

     The search stops the moment a seed is chosen: its results are replaced by
     the chip, and asking for them again would be a request for something no
     longer on screen.
  */
  const search = useFetch<SearchResults>(
    !seed && debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );

  const similar = useFetch<SimilarPayload>(
    seed?.imdbId ? `/api/similar?imdb=${encodeURIComponent(seed.imdbId)}` : null,
  );

  /*
     Only titles with an IMDb id can be offered.

     `/api/similar` takes one and nothing else, so a candidate without one is a
     seed that would fail after being picked. Filtering here means the list only
     ever contains choices that work.
  */
  const candidates = useMemo(
    () => (search.data?.titles ?? []).filter((t) => t.imdbId).slice(0, CANDIDATES),
    [search.data],
  );

  const items = similar.data?.items ?? [];
  // The canonical name from the recommendation route, falling back to the one
  // on the card that was clicked.
  const seedName = similar.data?.seed?.title || seed?.title || "";

  return (
    <section className="mb-16">
      <h2 className="mb-1 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
        Find Similar
      </h2>
      <p className="mb-6 font-body-md text-body-md text-on-surface-variant">
        Name something you liked and get titles genuinely like it — chosen by what its
        audience went on to watch, not by sharing a genre.
      </p>

      {seed ? (
        <SeedChip
          seed={seed}
          name={seedName}
          onChange={() => {
            /*
               The query is left as it was, so clearing the seed puts the same
               candidates straight back from cache instead of making someone
               retype the name they already typed.
            */
            setSeed(null);
          }}
        />
      ) : (
        <>
          <label className="sr-only" htmlFor="find-similar">
            Name a film or series
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
            />
            <input
              id="find-similar"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try Arrival, Chernobyl, Whiplash…"
              className="w-full rounded-full border border-white/10 bg-surface-container/60 py-3.5 pl-12 pr-4 font-body-md text-body-md text-on-surface outline-none ring-primary/60 transition-colors placeholder:text-on-surface-variant focus-visible:border-primary/40 focus-visible:ring-2"
            />
          </div>

          <CandidateList
            query={debounced}
            candidates={candidates}
            loading={search.loading && !search.data}
            error={search.error}
            onRetry={search.reload}
            onPick={setSeed}
          />
        </>
      )}

      {seed ? (
        <div className="mt-8">
          {similar.error ? (
            <ErrorState message={similar.error} onRetry={similar.reload} />
          ) : similar.loading && !similar.data ? (
            <LoadingState label={`Finding titles like ${seedName || "that"}…`} />
          ) : items.length === 0 ? (
            /*
               Said plainly rather than filled in. The route's own note: where
               TMDB's pool is thin it "stops the picks being wrong, it cannot
               make the data richer" — so the honest answer to a thin pool is a
               short row, and to an empty one, this.
            */
            <p className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
              Nothing in TMDB&rsquo;s data is close enough to {seedName} to recommend honestly.
              That usually means it&rsquo;s obscure rather than that nothing is like it.
            </p>
          ) : (
            <SimilarResults name={seedName} items={items} />
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Choosing the seed
 * ------------------------------------------------------------------ */

function CandidateList({
  query,
  candidates,
  loading,
  error,
  onRetry,
  onPick,
}: {
  query: string;
  candidates: MediaItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPick: (item: MediaItem) => void;
}) {
  if (query.length < 2) return null;

  if (error) {
    return (
      <div className="mt-4">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (loading) {
    return (
      <p className="pulsing-text mt-6 text-center font-label-md text-label-md text-on-surface-variant">
        Searching…
      </p>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="mt-6 text-center font-body-md text-body-md text-on-surface-variant">
        Nothing found for &ldquo;{query}&rdquo;.
      </p>
    );
  }

  return (
    <>
      <p className="mt-6 font-label-md text-label-md uppercase tracking-widest text-primary">
        Which one?
      </p>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8"
      >
        {candidates.map((item) => (
          <motion.button
            key={item.key}
            type="button"
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={() => onPick(item)}
            title={item.title}
            className="group text-left"
          >
            <div className="aspect-[2/3] overflow-hidden rounded-xl bg-surface-container ring-primary/0 transition-all duration-200 group-hover:ring-2 group-hover:ring-primary/60">
              <PosterImage
                src={item.poster}
                variants={item.posters}
                alt={item.title}
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-2 truncate font-title-lg text-[14px] text-on-surface">{item.title}</p>
            {/*
               Year and kind are the whole point of this list: they are what
               tells four films called Arrival apart.
            */}
            <p className="truncate font-label-md text-[12px] text-on-surface-variant">
              {item.year ?? "TBA"} · {item.kind === "series" ? "TV" : "Movie"}
            </p>
          </motion.button>
        ))}
      </motion.div>
    </>
  );
}

function SeedChip({
  seed,
  name,
  onChange,
}: {
  seed: MediaItem;
  name: string;
  onChange: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex items-center gap-4 rounded-full p-2 pr-3"
    >
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-container">
        <PosterImage
          src={seed.poster}
          variants={seed.posters}
          alt={name || seed.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-label-md text-label-md text-on-surface-variant">Similar to</p>
        <p className="truncate font-title-lg text-[15px] text-on-surface">
          {name || seed.title}
          {seed.year ? (
            <span className="font-label-md text-label-md text-on-surface-variant">
              {" "}
              ({seed.year})
            </span>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-full bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        Change
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

function SimilarResults({ name, items }: { name: string; items: MediaItem[] }) {
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
           Not expandable. `/api/similar` returns at most ten and RailGrid's
           window is twelve, so `rotateWindow` passes the list straight through
           and the ranking survives — a rotating window would shuffle an answer
           that was ordered on purpose.
        */}
        <RailGrid rail={{ title: `More like ${name}`, blurb, items }} />
      </motion.div>
    </AnimatePresence>
  );
}
