"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { SimilarPayload } from "@/app/api/similar/route";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { Carousel } from "./Carousel";
import { PosterCard } from "./PosterCard";

/** How many the rail shows. The route returns more so the filter below has slack. */
const SHOWN = 5;

/**
 * Recommendations seeded by the last thing the viewer actually played in a
 * connected Stremio account.
 *
 * The seed comes from `useAppStore.lastWatched`, which `useLibrarySync` refills
 * on window focus — so watching something else in Stremio and coming back to
 * this tab re-seeds the rail on its own, with no polling and no extra request.
 * Everything personal stays in the browser: the route is asked only "what is
 * like tt4540710", and the library filter runs here.
 */
export function BecauseYouWatched() {
  const seed = useAppStore((s) => s.lastWatched);
  const known = useAppStore((s) => s.knownLibraryIds);

  const { data } = useFetch<SimilarPayload>(
    seed ? `/api/similar?imdb=${encodeURIComponent(seed.imdbId)}` : null,
  );

  const items = useMemo(() => {
    /*
       `knownLibraryIds`, not `libraryIds`.

       Stremio stores a title you merely pressed play on as a `temp` row with
       `removed: true`, so it is in `known` and not in the library proper.
       Filtering on the library alone would recommend back the things you have
       already seen, which is the one thing this rail must not do.
    */
    const all = data?.items ?? [];
    return all.filter((item) => !item.imdbId || !known.has(item.imdbId)).slice(0, SHOWN);
  }, [data, known]);

  /*
     Nothing at all rather than an empty state.

     This is the first thing under the hero, and there are several ordinary
     reasons for it to have no answer — no Stremio account connected, nothing
     played yet, a seed TMDB doesn't know, everything similar already watched.
     None of them is worth a headline explaining itself to someone who never
     asked for the feature. Two is the floor: one lonely poster under a
     personal heading reads as a bug.
  */
  if (!seed || !data?.seed || items.length < 2) return null;

  const title = data.seed.title || seed.title;

  return (
    <Carousel
      title={
        <>
          Because you watched <span className="text-primary">{title}</span>
        </>
      }
    >
      <motion.div
        className="flex gap-[18px]"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        initial="hidden"
        animate="show"
      >
        {items.map((item) => (
          <PosterCard key={item.key} item={item} />
        ))}
      </motion.div>
    </Carousel>
  );
}
