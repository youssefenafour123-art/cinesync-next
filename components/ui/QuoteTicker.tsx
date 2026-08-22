"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * - **It pauses on hover and focus.** Unlike the hero banner, this is a block
 *   of text someone may be part-way through reading, and it's small enough
 *   that a resting cursor over it is a real signal rather than an accident.
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

  const advance = useCallback((step: number) => {
    setIndex((i) => (i + step + QUOTES.length) % QUOTES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => advance(1), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, advance, index]);

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
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={`${order[index]}-${index}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(4px)" }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14, filter: "blur(4px)" }}
            transition={{ duration: reduced ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
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

      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => advance(-1)}
          aria-label="Previous quote"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Icon name="chevron_left" className="text-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => advance(1)}
          aria-label="Next quote"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Icon name="chevron_right" className="text-[18px]" />
        </button>
      </div>
    </section>
  );
}
