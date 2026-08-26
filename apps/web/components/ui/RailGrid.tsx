"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { MediaItem, Rail } from "@/lib/types";
import { rotateWindow } from "@/lib/rotation";
import { useAppStore } from "@/store/useAppStore";
import { TiltCard } from "@/components/ui/TiltCard";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";

/*
   Lifted out of MoviesTab so Find Similar can render its results as the same
   shelf the curated rails use.

   It moved rather than being exported from there because the tab renders Find
   Similar: importing the grid back out of the tab would have been a genuine
   module cycle, for a component that was never specific to the tab anyway.
*/

/** Titles a rail shows at once, out of the larger pool the route returns. */
const RAIL_SIZE = 12;

export function RailGrid({ rail, expandable = false }: { rail: Rail; expandable?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Collapsing from below the fold would otherwise leave the reader looking at
  // whatever the page reflowed under them.
  useEffect(() => {
    if (!expanded) return;
    return () => headingRef.current?.scrollIntoView({ block: "nearest" });
  }, [expanded]);

  // A different window of the pool each visit — see `rotateWindow`. Keyed on
  // the rail title so the rails move independently rather than in step.
  const shown = useMemo(
    () => rotateWindow(rail.items, RAIL_SIZE, rail.title),
    [rail.items, rail.title],
  );

  /*
     Expanding appends; it never reshuffles.

     The obvious implementation — render `rail.items` when expanded — puts the
     pool back in plain rank order, so the twelve already on screen jump to new
     positions the moment the button is pressed. Keeping the rotated window
     first and adding the remainder after it means the only thing that changes
     is that more appears below.
  */
  const items = useMemo(() => {
    if (!expandable || !expanded) return shown;
    const inWindow = new Set(shown);
    return [...shown, ...rail.items.filter((item) => !inWindow.has(item))];
  }, [expandable, expanded, shown, rail.items]);

  const canExpand = expandable && rail.items.length > RAIL_SIZE;

  return (
    <>
      <div className="mb-6 border-b border-white/10 pb-4">
        <h2
          ref={headingRef}
          className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg"
        >
          {rail.title}
        </h2>
        {rail.blurb ? (
          <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">{rail.blurb}</p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center font-body-md text-body-md text-on-surface-variant">
          Nothing matched this one.
        </p>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-unit md:grid-cols-3 lg:grid-cols-4"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          initial="hidden"
          animate="show"
        >
          {items.map((item) => (
            <CuratedCard key={item.key} item={item} />
          ))}
        </motion.div>
      )}

      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-6 font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
        >
          {expanded ? "Show fewer" : `Show all ${rail.items.length}`}
        </button>
      ) : null}
    </>
  );
}

function CuratedCard({ item }: { item: MediaItem }) {
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, rotateY: -25, y: 30 },
        show: { opacity: 1, rotateY: 0, y: 0 },
      }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      style={{ perspective: 1000 }}
    >
      <TiltCard
        onClick={() => openDetails(item)}
        className="movie-card poster-glow poster-live group relative aspect-[2/3] cursor-pointer overflow-hidden rounded border border-white/5 bg-surface-container"
      >
        <PosterImage src={item.poster}
            variants={item.posters} alt={item.title} className="h-full w-full object-cover" />

        {inLibrary ? (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/20 bg-primary/90 px-2 py-1 text-[11px] font-bold text-[#002113] backdrop-blur-sm">
            <Icon name="check" className="text-[14px]" />
            In Library
          </div>
        ) : null}

        <div className="movie-card-overlay absolute inset-0 flex flex-col justify-end p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {item.rating ? (
              <span className="rounded-sm border border-primary/30 bg-primary/20 px-2 py-1 font-label-md text-[12px] text-primary">
                ★ {item.rating}
              </span>
            ) : null}
            {item.year ? (
              <span className="rounded-sm bg-black/50 px-2 py-1 font-label-md text-[12px] text-on-surface backdrop-blur-md">
                {item.year}
              </span>
            ) : null}
          </div>
          <h3 className="mb-1 font-title-lg text-[18px] leading-tight text-white transition-colors group-hover:text-primary">
            {item.title}
          </h3>
          <p className="line-clamp-2 font-body-md text-[13px] text-on-surface-variant">
            {item.description || "No synopsis available."}
          </p>
        </div>
      </TiltCard>
    </motion.div>
  );
}
