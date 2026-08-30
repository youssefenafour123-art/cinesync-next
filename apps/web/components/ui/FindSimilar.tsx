"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { LookupPayload, LookupTitle } from "@/app/api/lookup/route";
import { useFetch } from "@/lib/useFetch";
import { SimilarRail } from "./SimilarRail";
import { PosterImage } from "./PosterImage";
import { Icon } from "./Icon";
import { ErrorState } from "./States";

const DEBOUNCE_MS = 350;
/** Candidates offered for one query. Enough to disambiguate, not a second search page. */
const CANDIDATES = 8;

/**
 * "More like this", for a title you type rather than one you watched.
 *
 * The row itself is `SimilarRail`, shared with the details panel, and the
 * recommending inside it is entirely `/api/similar`'s.
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
  const [seed, setSeed] = useState<LookupTitle | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  /*
     The search stops the moment a seed is chosen: its results are replaced by
     the chip, and asking for them again would be a request for something no
     longer on screen. `useFetch` is cached by URL with no invalidation, so
     clearing the seed puts the same candidates back without a round trip.
  */
  /*
     `/api/lookup`, not `/api/search`.

     The search route enriches every hit with a TMDB detail request each, which
     is right for the search modal — it shows ratings and synopses — and was
     costing ten seconds here to render posters and years. Lookup answers the
     only question this list asks, in one request.
  */
  const search = useFetch<LookupPayload>(
    !seed && debounced.length >= 2 ? `/api/lookup?q=${encodeURIComponent(debounced)}` : null,
  );

  // Every lookup result is a usable seed — the route returns only films and
  // shows, and `/api/similar` now takes the TMDB id each of them carries.
  const candidates = useMemo(() => (search.data?.titles ?? []).slice(0, CANDIDATES), [search.data]);

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
          {/*
             Seeded by TMDB id, which is what the picker already holds. Asking
             by IMDb id would mean resolving one just so the route could
             resolve it back.
          */}
          <SimilarRail tmdbId={seed.tmdbId} kind={seed.kind} title={seed.title} />
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
  candidates: LookupTitle[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPick: (item: LookupTitle) => void;
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
            key={`${item.kind}:${item.tmdbId}`}
            type="button"
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={() => onPick(item)}
            title={item.title}
            className="group text-left"
          >
            <div className="poster-live aspect-[2/3] overflow-hidden rounded-xl bg-surface-container ring-primary/0 transition-all duration-200 group-hover:ring-2 group-hover:ring-primary/60">
              <PosterImage src={item.poster} alt={item.title} className="h-full w-full object-cover" />
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

function SeedChip({ seed, onChange }: { seed: LookupTitle; onChange: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex items-center gap-4 rounded-full p-2 pr-3"
    >
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-container">
        <PosterImage src={seed.poster} alt={seed.title} className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-label-md text-label-md text-on-surface-variant">Similar to</p>
        <p className="truncate font-title-lg text-[15px] text-on-surface">
          {seed.title}
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
