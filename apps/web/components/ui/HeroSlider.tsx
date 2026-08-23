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

/** Copy blocks animate in one after another rather than as a single lump. */
const COPY_STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
  out: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
};

/**
 * Discover hero. A rotating slider of the most-watched titles.
 *
 * It advances on its own and keeps advancing. Two earlier details stopped it
 * from ever doing so in practice:
 *
 * - hovering *anywhere* on the banner paused it. The banner is 70vh of a
 *   viewport whose only other content is below the fold, so a resting cursor
 *   parked it indefinitely. Only a focused control pauses it now — that's the
 *   case the pause is actually for, someone tabbing through the dots.
 * - `prefers-reduced-motion` skipped the interval entirely. That preference is
 *   about movement, not about content standing still forever, so it drops the
 *   pan and cross-fade and swaps slides outright instead.
 *
 * What it did *not* do until now was make the change feel like anything. Each
 * slide simply cross-faded in place, which at 70vh reads as the page quietly
 * repainting rather than as a slider moving. Three things fix that:
 *
 * - the transition is directional. `direction` is set by whatever triggered the
 *   change — arrows, dots, or the timer — and the outgoing slide leaves the way
 *   the incoming one arrives, so the movement has a direction you can follow.
 * - the backdrop holds a slow continuous zoom for the whole time a slide is up,
 *   keyed on the slide, so the banner is never actually still.
 * - the copy staggers in line by line instead of arriving as one block.
 *
 * `index` is in the interval's deps, so using the arrows or dots restarts the
 * countdown rather than advancing again a moment later.
 */
export function HeroSlider({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  // +1 when moving forward, -1 when moving back. Drives which way both the
  // outgoing and incoming slides travel.
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => s.libraryIds);
  const { play } = useTrailer();
  const { add, pending } = useAddToLibrary();
  const reduced = useReducedMotion();

  const count = items.length;

  const go = useCallback(
    (n: number) => {
      setIndex((prev) => {
        const next = ((n % count) + count) % count;
        if (next !== prev) {
          // Shortest way round the loop, so jumping from the last dot to the
          // first travels forward rather than winding all the way back.
          const forward = (next - prev + count) % count;
          setDirection(forward <= count / 2 ? 1 : -1);
        }
        return next;
      });
    },
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % count);
    }, ADVANCE_MS);
    return () => clearInterval(t);
  }, [count, paused, index]);

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
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Most watched right now"
    >
      {/*
        Opaque floor under the whole banner.

        The section had no background of its own, and its artwork sits at 60%
        opacity — so the remaining 40% was the ambient poster wall showing
        straight through the hero. That was survivable while the wall was
        rendering at ~15% visibility; now that the wall is actually visible, the
        banner read as a translucent panel with somebody else's posters behind
        the artwork. This is the layer the artwork composites onto instead.
      */}
      <div className="absolute inset-0 z-0 bg-background" />

      {/* Cross-fading, cross-sliding backdrop */}
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={item.key}
          custom={direction}
          className="absolute inset-0 z-0"
          initial={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, scale: 1.12, x: direction * 80, filter: "blur(8px)" }
          }
          animate={
            reduced ? { opacity: 1 } : { opacity: 1, scale: 1.06, x: 0, filter: "blur(0px)" }
          }
          exit={
            reduced ? { opacity: 0 } : { opacity: 0, scale: 1.02, x: direction * -60 }
          }
          transition={{ duration: reduced ? 0 : 1.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {/*
            A second element carries the ambient zoom, because the outer one is
            already animating scale as part of the entrance. Nesting them keeps
            the two from fighting over the same property: the entrance settles
            at 1.06 while this one crawls from 1 to 1.1 underneath it for as
            long as the slide is up.
          */}
          <motion.div
            key={`pan-${item.key}`}
            className="h-full w-full"
            initial={reduced ? false : { scale: 1 }}
            animate={reduced ? undefined : { scale: 1.1 }}
            transition={{ duration: ADVANCE_MS / 1000 + 2, ease: "linear" }}
          >
            {/*
              Raised from 60% now that it composites onto solid background
              rather than onto the poster wall. The two gradients below still
              carry the text contrast, so the artwork can afford to be brighter
              than it was when it was doubling as a scrim.
            */}
            <PosterImage
              src={item.backdrop || item.poster}
              alt=""
              className="h-full w-full object-cover opacity-80"
            />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-background via-background/40 to-transparent" />

      {/* Slide copy */}
      <div className="relative z-20 w-full">
        {/*
          popLayout, not "wait". `mode="wait"` holds the incoming slide back
          until the outgoing one's exit animation finishes, so an occluded or
          backgrounded window — where the frame loop stalls and exit never
          completes — freezes the banner on whichever slide it was showing even
          though the index keeps advancing. Same trap `page.tsx` documents for
          the tab shell. popLayout mounts the new copy immediately and lifts the
          old one out of flow, so nothing shifts while they cross-fade.
        */}
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={item.key}
            custom={direction}
            variants={reduced ? undefined : COPY_STAGGER}
            initial={reduced ? { opacity: 0 } : "hidden"}
            animate={reduced ? { opacity: 1 } : "show"}
            exit={reduced ? { opacity: 0 } : "out"}
            transition={reduced ? { duration: 0 } : undefined}
            className="flex max-w-3xl flex-col gap-5"
          >
            <CopyLine reduced={reduced} direction={direction}>
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
            </CopyLine>

            <CopyLine reduced={reduced} direction={direction}>
              <button
                type="button"
                onClick={() => openDetails(item)}
                className="glow-text text-left font-display-lg text-display-md leading-none tracking-tighter text-white drop-shadow-2xl transition-colors hover:text-primary md:text-display-lg"
              >
                {item.title}
              </button>
            </CopyLine>

            <CopyLine reduced={reduced} direction={direction}>
              <p className="line-clamp-3 max-w-xl font-body-lg text-body-lg text-on-surface-variant">
                {item.description || "No description available."}
              </p>
            </CopyLine>

            <CopyLine reduced={reduced} direction={direction}>
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
            </CopyLine>
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
                  className={`relative h-2 overflow-hidden rounded-full transition-all duration-500 ${
                    i === index ? "w-9 bg-white/25" : "w-2 bg-white/30 hover:bg-white/50"
                  }`}
                >
                  {/*
                    The active dot fills over exactly the auto-advance interval,
                    so the slider shows how long the current slide has left
                    instead of changing without warning. Keyed on the index so
                    every arrival restarts the fill, and paused along with the
                    timer it represents.
                  */}
                  {i === index ? (
                    <motion.span
                      key={`fill-${index}`}
                      className="absolute inset-y-0 left-0 block rounded-full bg-primary"
                      initial={{ width: reduced ? "100%" : 0 }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: reduced || paused ? 0 : ADVANCE_MS / 1000,
                        ease: "linear",
                      }}
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One staggered line of slide copy.
 *
 * Split out so each block is a variant child of the copy container — a variant
 * only cascades to direct children, and the parent needs them enumerated to
 * stagger them. `direction` decides which side each line enters from, matching
 * the backdrop.
 */
function CopyLine({
  children,
  reduced,
  direction,
}: {
  children: React.ReactNode;
  reduced: boolean;
  direction: number;
}) {
  if (reduced) return <div>{children}</div>;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, x: direction * 48, y: 8 },
        show: { opacity: 1, x: 0, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
        out: { opacity: 0, x: direction * -28, transition: { duration: 0.25 } },
      }}
    >
      {children}
    </motion.div>
  );
}
