"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface CarouselProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Hide the arrows when the rail is a search-results strip. */
  showArrows?: boolean;
}

/**
 * Horizontal rail with GSAP-tweened arrow scrolling.
 *
 * The legacy version called `scrollBy({behavior:'smooth'})`, which can't be
 * interrupted; a tween can, so rapid arrow clicks stay responsive.
 *
 * Two things make the movement itself read better than a fixed nudge:
 *
 * - the step is a near-page of whatever is actually on screen rather than a
 *   hardcoded 440px, so one click lands the next set of cards at the edge
 *   instead of leaving a card and a half hanging at every viewport width;
 * - the arrows know where the rail is. At either end the corresponding arrow
 *   fades out rather than sitting there doing nothing, and the edge masks
 *   follow, so the rail visibly has more to show in one direction.
 */
export function Carousel({ title, children, showArrows = true }: CarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setAtStart(rail.scrollLeft <= 2);
    // A rail with nothing to scroll counts as "at the end", which hides both
    // arrows rather than showing one that can't do anything.
    setAtEnd(max <= 2 || rail.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    sync();
    rail.addEventListener("scroll", sync, { passive: true });

    // Cards arrive asynchronously, so the initial measurement is taken again
    // once the rail's content settles.
    const observer = new ResizeObserver(sync);
    observer.observe(rail);

    return () => {
      rail.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync]);

  const scrollByPage = (dir: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;

    // Overlap by ~15% so the card at the boundary stays partly visible and the
    // eye can follow where the rail moved to.
    const step = Math.max(240, rail.clientWidth * 0.85) * dir;
    const target = Math.max(0, Math.min(rail.scrollLeft + step, rail.scrollWidth - rail.clientWidth));

    if (reduced) {
      rail.scrollLeft = target;
      sync();
      return;
    }

    gsap.to(rail, {
      scrollLeft: target,
      duration: 0.7,
      ease: "power3.out",
      overwrite: true,
      onUpdate: sync,
    });
  };

  return (
    <div className="carousel-section">
      {title ? <div className="carousel-title">{title}</div> : null}
      <div className="carousel-wrapper">
        {showArrows && (
          <button
            type="button"
            aria-label="Scroll left"
            aria-disabled={atStart}
            className={`scroll-btn left${atStart ? " is-spent" : ""}`}
            onClick={() => scrollByPage(-1)}
          >
            &#10094;
          </button>
        )}
        <div
          ref={railRef}
          className={`carousel${atStart ? " at-start" : ""}${atEnd ? " at-end" : ""}`}
        >
          {children}
        </div>
        {showArrows && (
          <button
            type="button"
            aria-label="Scroll right"
            aria-disabled={atEnd}
            className={`scroll-btn right${atEnd ? " is-spent" : ""}`}
            onClick={() => scrollByPage(1)}
          >
            &#10095;
          </button>
        )}
      </div>
    </div>
  );
}
