"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { SavedTitle } from "@/lib/lists";
import type { MediaItem } from "@/lib/types";
import { metahubPoster } from "@/lib/stremio";
import { Icon } from "./Icon";
import { PosterImage } from "./PosterImage";

/**
 * A saved title as the rest of the app's components expect one.
 *
 * `SavedTitle` is deliberately the smaller shape — it is what a list row
 * holds, so a list renders without calling TMDB. The details modal fetches
 * everything else from the id.
 */
export function toMediaItem(t: SavedTitle): MediaItem {
  return {
    key: t.imdbId,
    imdbId: t.imdbId,
    tmdbId: t.tmdbId,
    title: t.title,
    kind: t.kind,
    poster: t.poster,
  };
}

interface SavedTitleGridProps {
  items: SavedTitle[];
  /** Omitted for a list you are only looking at — someone else's, later on. */
  onRemove?: (title: SavedTitle) => void;
  /** Reads out on the button, so it has to name the list, not just the title. */
  removeLabel?: (title: SavedTitle) => string;
  removeIcon?: string;
  busy?: boolean;
}

/**
 * The shelf every saved list is drawn as.
 *
 * One component rather than one per section: the watchlist and a custom list
 * hold the identical row shape and differ only in what removing means, so the
 * alternative was two grids that would drift apart the first time either was
 * touched.
 */
export function SavedTitleGrid({
  items,
  onRemove,
  removeLabel,
  removeIcon = "bookmark_remove",
  busy = false,
}: SavedTitleGridProps) {
  const openDetails = useAppStore((s) => s.openDetails);

  /*
     Which card is under the pointer, in React rather than in CSS.

     `group-hover:` can only toggle a class, and a class cannot spring. Holding
     it here lets the control arrive on a spring and leave on one, and lets the
     button own its own press feedback — a transform Tailwind would be fighting
     for if both were setting one.

     Focus writes to the same value, so the control is reachable by keyboard
     rather than being a button that exists only for a mouse.
  */
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const open = () => openDetails(toMediaItem(t));
          return (
            <motion.div
              key={t.imdbId}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              /*
                 A removal should look like the title leaving, not like it
                 blinking out. It drops back and fades while the rest of the
                 grid closes the gap — `layout` above is what animates that
                 reflow, and the two together are the whole effect.
              */
              exit={{ opacity: 0, scale: 0.82, y: 12, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              onClick={open}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }}
              onHoverStart={() => setActive(t.imdbId)}
              onHoverEnd={() => setActive((id) => (id === t.imdbId ? null : id))}
              className="group relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl bg-surface-container"
            >
              {/*
                 `poster` is whatever the title wore when it was saved, and a
                 list has to render without calling TMDB. Metahub keyed by the
                 IMDb id is the fallback for rows saved before a poster was
                 known.
              */}
              <PosterImage
                src={t.poster ?? metahubPoster(t.imdbId)}
                alt={t.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="poster-overlay absolute inset-0 flex flex-col justify-end p-3 opacity-0 transition-opacity duration-300 focus-within:opacity-100 group-hover:opacity-100">
                <h4 className="truncate font-title-lg text-[15px] text-on-surface">{t.title}</h4>
                <p className="font-label-md text-[12px] text-primary">
                  {t.kind === "series" ? "TV" : "Movie"}
                </p>
              </div>

              {onRemove ? (
                <motion.button
                  type="button"
                  onClick={(e) => {
                    // The tile itself opens the title; without this the modal
                    // would open behind the removal.
                    e.stopPropagation();
                    onRemove(t);
                  }}
                  disabled={busy}
                  aria-label={removeLabel?.(t) ?? `Remove ${t.title}`}
                  title={removeLabel?.(t) ?? `Remove ${t.title}`}
                  onFocus={() => setActive(t.imdbId)}
                  onBlur={() => setActive((id) => (id === t.imdbId ? null : id))}
                  // Rendered always so it can be tabbed to, revealed by state.
                  animate={
                    active === t.imdbId
                      ? { opacity: 1, scale: 1, y: 0 }
                      : { opacity: 0, scale: 0.4, y: -6 }
                  }
                  whileHover={{ scale: 1.18 }}
                  whileTap={{ scale: 0.82 }}
                  transition={{ type: "spring", stiffness: 520, damping: 26 }}
                  /*
                     Inset far enough to clear the corner, not tucked into it.

                     `--radius-xl` is 3rem here, not Tailwind's 0.75rem — these
                     cards have a 48px corner — and the card is `overflow-hidden`,
                     so the curve clips anything near it. At 6px in, the button
                     was being sliced by the poster's own border. A 28px control
                     that grows to 33px on hover needs about 12px of inset to sit
                     clear of a 48px arc; 14px leaves margin.
                  */
                  className="absolute right-3.5 top-3.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white/90 ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-error hover:text-on-error hover:ring-error"
                >
                  <Icon name={removeIcon} className="text-[14px]" />
                </motion.button>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Poster-shaped shimmer in the same grid, for while a list is loading. */
export function SavedTitleGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface-container" />
      ))}
    </div>
  );
}
