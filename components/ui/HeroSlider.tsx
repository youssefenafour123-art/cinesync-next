"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MediaItem } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useAddToLibrary } from "@/lib/useAddToLibrary";
import { useTrailer } from "@/lib/useTrailer";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { PosterImage } from "./PosterImage";
import { Icon } from "./Icon";

const ADVANCE_MS = 8000;

/**
 * Discover hero. Replaces the single static banner with a rotating slider of
 * the most-watched titles, cross-fading between slides.
 */
export function HeroSlider({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => s.libraryIds);
  const { play } = useTrailer();
  const { add, pending } = useAddToLibrary();
  const reduced = useReducedMotion();

  const count = items.length;
  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || reduced) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearInterval(t);
  }, [count, paused, reduced, index]);

  if (!count) {
    return (
      <div className="h-[70vh] min-h-[460px] w-full animate-pulse rounded-b-3xl bg-surface-container-low" />
    );
  }

  const item = items[index];
  const already = Boolean(item.imdbId && inLibrary.has(item.imdbId));

  return (
    <section
      className="relative mx-auto flex h-[70vh] min-h-[460px] w-full max-w-container-max items-end overflow-hidden rounded-b-3xl px-margin-mobile pb-14 md:px-margin-desktop"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Most watched right now"
    >
      {/* Cross-fading backdrop */}
      <AnimatePresence initial={false}>
        <motion.div
          key={item.key}
          className="absolute inset-0 z-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <PosterImage
            src={item.backdrop || item.poster}
            alt=""
            className="h-full w-full object-cover opacity-60"
          />
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-background via-background/40 to-transparent" />

      {/* Slide copy */}
      <div className="relative z-20 w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex max-w-3xl flex-col gap-5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-secondary/30 bg-secondary-container/20 px-3 py-1 font-label-md text-label-md uppercase tracking-widest text-secondary backdrop-blur-md">
                #{index + 1} Most Watched
              </span>
              <span className="rounded-full border border-white/10 bg-surface-container/50 px-3 py-1 font-label-md text-label-md backdrop-blur-md">
                {item.kind === "series" ? "Series" : "Movie"}
              </span>
              {item.year ? (
                <span className="rounded-full border border-white/10 bg-surface-container/50 px-3 py-1 font-label-md text-label-md backdrop-blur-md">
                  {item.year}
                </span>
              ) : null}
              {item.rating ? (
                <span className="flex items-center gap-1 rounded-full border border-white/10 bg-black/50 px-3 py-1 font-label-md text-label-md backdrop-blur-md">
                  <Icon name="star" className="text-[16px] text-[#f5c518]" fill />
                  {item.rating}
                </span>
              ) : null}
              {already ? (
                <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 font-label-md text-label-md text-primary backdrop-blur-md">
                  <Icon name="check" className="text-[16px]" />
                  In Library
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => openDetails(item)}
              className="glow-text text-left font-display-lg text-display-md leading-none tracking-tighter text-white drop-shadow-2xl transition-colors hover:text-primary md:text-display-lg"
            >
              {item.title}
            </button>

            <p className="line-clamp-3 max-w-xl font-body-lg text-body-lg text-on-surface-variant">
              {item.description || "No description available."}
            </p>

            <div className="mt-2 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => play(item)}
                className="flex items-center gap-2 rounded-full bg-primary px-7 py-3 font-title-lg text-title-lg text-on-primary transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(78,222,163,0.6)]"
              >
                <Icon name="play_arrow" fill />
                Watch Trailer
              </button>

              {already ? (
                <span className="flex cursor-default items-center gap-2 rounded-full border border-primary/30 bg-surface-container/30 px-7 py-3 font-title-lg text-title-lg text-primary backdrop-blur-md">
                  <Icon name="check" />
                  Already in Library
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => add(item)}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-surface-container/30 px-7 py-3 font-title-lg text-title-lg text-white backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-white/10 disabled:opacity-60"
                >
                  <Icon
                    name={pending ? "progress_activity" : "add"}
                    className={pending ? "animate-spin" : ""}
                  />
                  Add to Library
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slide controls */}
        {count > 1 ? (
          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous slide"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-primary hover:text-on-primary"
            >
              <Icon name="chevron_left" className="text-[20px]" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next slide"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-primary hover:text-on-primary"
            >
              <Icon name="chevron_right" className="text-[20px]" />
            </button>

            <div className="ml-2 flex gap-2">
              {items.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to ${s.title}`}
                  aria-current={i === index}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? "w-7 bg-primary" : "w-2 bg-white/30 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
