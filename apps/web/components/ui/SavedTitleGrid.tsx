"use client";

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
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.25 }}
              onClick={open}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }}
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
                <button
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
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white opacity-0 backdrop-blur-md transition-all duration-200 hover:bg-error hover:text-on-error focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                >
                  <Icon name={removeIcon} className="text-[18px]" />
                </button>
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
