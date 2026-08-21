"use client";

import { useRef } from "react";
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
 * The legacy version called `scrollBy({behavior:'smooth'})`, which can't be
 * interrupted; a tween can, so rapid arrow clicks stay responsive.
 */
export function Carousel({ title, children, showArrows = true }: CarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const scrollBy = (delta: number) => {
    const rail = railRef.current;
    if (!rail) return;

    const target = Math.max(
      0,
      Math.min(rail.scrollLeft + delta, rail.scrollWidth - rail.clientWidth),
    );

    if (reduced) {
      rail.scrollLeft = target;
      return;
    }

    gsap.to(rail, { scrollLeft: target, duration: 0.6, ease: "power2.out", overwrite: true });
  };

  return (
    <div className="carousel-section">
      {title ? <div className="carousel-title">{title}</div> : null}
      <div className="carousel-wrapper">
        {showArrows && (
          <button
            type="button"
            aria-label="Scroll left"
            className="scroll-btn left"
            onClick={() => scrollBy(-440)}
          >
            &#10094;
          </button>
        )}
        <div ref={railRef} className="carousel">
          {children}
        </div>
        {showArrows && (
          <button
            type="button"
            aria-label="Scroll right"
            className="scroll-btn right"
            onClick={() => scrollBy(440)}
          >
            &#10095;
          </button>
        )}
      </div>
    </div>
  );
}
