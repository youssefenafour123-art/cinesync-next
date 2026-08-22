"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QUOTES } from "@/lib/quotes";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Icon } from "./Icon";

const ROTATE_MS = 11_000;

/**
 * The rotating quote strip that closes every page.
 *
 * Three details are load-bearing:
 *
 * - **The order is shuffled, but only after mount.** Picking a random quote
 *   during render would produce different HTML on the server and the client,
 *   which React reports as a hydration mismatch and resolves by throwing away
 *   the server's markup. So the first paint is always `QUOTES[0]` on both
 *   sides, and the shuffle is applied in an effect — by which point the
 *   cross-fade makes the swap look deliberate.
 * - **It advances on its own and offers no controls.** It is a closing flourish,
 *   not something to operate; arrows on it made the footer look like another
 *   carousel competing with the two real ones. It still pauses while the
 *   pointer rests on it — that is not a control, it is the one thing standing
 *   between a reader half-way through a long quote and losing it, and WCAG
 *   2.2.2 wants a way to stop auto-updating text.
 * - **It is a `<blockquote>` with a `<cite>`,** and the rotation is announced
 *   politely, so the strip is a quotation to a screen reader rather than a
 *   decorative string that changes on its own.
 */
export function QuoteTicker() {
  const [index, setIndex] = useState(0);
  const [order, setOrder] = useState<number[]>(() => QUOTES.map((_, i) => i));
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const shuffled = useRef(false);

  // Shuffle once, post-hydration, so a reload doesn't open on the same line.
  useEffect(() => {
    if (shuffled.current) return;
    shuffled.current = true;

    const next = QUOTES.map((_, i) => i);
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % QUOTES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused]);

  const quote = useMemo(() => QUOTES[order[index] ?? 0], [order, index]);

  return (
    <section
      className="relative mx-auto w-full max-w-3xl px-margin-mobile py-12 text-center md:px-margin-desktop"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-label="Quotes from film and television"
    >
      <Icon
        name="format_quote"
        className="mb-2 rotate-180 text-[40px] leading-none text-primary/35"
        aria-hidden
      />

      {/*
        A fixed minimum height, because the quotes differ in length by a factor
        of four. Without it the footer — and therefore the page — jumps every
        time the line changes, which is exactly the sort of movement that makes
        a page feel unstable.
      */}
      <div className="flex min-h-[168px] flex-col items-center justify-center sm:min-h-[152px]">
        {/* Slides in from the right and leaves to the left — always the same
            way round, because nothing steers it and a direction that never
            changes reads as a procession rather than as a control someone
            forgot to press. */}
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={`${order[index]}-${index}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 60, filter: "blur(5px)" }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, filter: "blur(5px)" }}
            transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-4"
          >
            <p className="text-balance font-display-md text-[19px] italic leading-relaxed text-on-surface/90 md:text-[24px]">
              &ldquo;{quote.text}&rdquo;
            </p>

            <footer className="font-body-md text-[13px] text-on-surface-variant">
              <span className="text-primary">{quote.speaker}</span>
              <span className="text-on-surface-variant/60"> — {quote.actor}</span>
              <span className="mx-2 text-on-surface-variant/40">·</span>
              <cite className="not-italic text-on-surface/80">{quote.title}</cite>
              <span className="text-on-surface-variant/60">
                {" "}
                ({quote.year}, {quote.kind === "series" ? "series" : "film"})
              </span>
            </footer>
          </motion.blockquote>
        </AnimatePresence>
      </div>

      {/* Live region kept separate from the animated node: announcing the
          element that is mid-transition reads out half-built content. */}
      <p className="sr-only" aria-live="polite">
        {quote.text} — {quote.speaker}, {quote.title} ({quote.year})
      </p>

      {/* A hairline that fills over the interval. Not a control — there is
          nothing to click — just something that makes the change look intended
          rather than sudden. */}
      <div className="mx-auto mt-5 h-px w-24 overflow-hidden rounded-full bg-white/10">
        <motion.div
          key={`bar-${index}`}
          className="h-full bg-primary/50"
          initial={{ width: reduced || paused ? "100%" : 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: reduced || paused ? 0 : ROTATE_MS / 1000, ease: "linear" }}
        />
      </div>
    </section>
  );
}
