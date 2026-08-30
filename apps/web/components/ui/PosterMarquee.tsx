"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoverPayload } from "@/app/api/discover/route";
import { fetchShared } from "@/lib/useFetch";
import { backdropPoster } from "@/lib/rotation";

/** Columns on screen, and how long each takes to travel its own height once. */
const COLUMNS = [
  { drift: 52, reverse: false },
  { drift: 68, reverse: true },
  { drift: 44, reverse: false },
] as const;

/** Posters per column before the track repeats. */
const PER_COLUMN = 7;

/**
 * Three columns of real poster art, sliding.
 *
 * The artwork is the wall pool from `/api/discover`, pulled through
 * `fetchShared` — which is cache-first — so by the time anyone opens the modal
 * this sits behind, the payload is already in memory and the panel costs no
 * request at all. On a cold visit it resolves in the background and the panel
 * fades in; it never blocks the form beside it.
 *
 * Deliberately **not** `AmbientBackground`. That component is twelve columns,
 * 192 images, a per-frame GSAP pointer pass and a rotating `src` swap — it was
 * just tuned from ~3s of style recalculation down to ~450ms, and standing a
 * second copy of it up behind a modal would spend that back. This is 21 images
 * and two CSS keyframes on `transform` alone, which the compositor handles
 * without a main-thread frame.
 *
 * Being CSS rather than JS also means the app's reduced-motion reset already
 * governs it: that rule zeroes `animation-duration` on everything, so a visitor
 * who asked for less motion gets a still collage rather than special handling
 * here.
 */
export function PosterMarquee({ className = "" }: { className?: string }) {
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetchShared<DiscoverPayload>("/api/discover")
      .then((data) => {
        if (active && data?.wall?.length) setPosters(data.wall);
      })
      .catch(() => {
        // Decoration. A failure here leaves the panel empty and the form,
        // which is the point of the screen, entirely unaffected.
      });
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(
    () =>
      COLUMNS.map((col, i) => ({
        ...col,
        // A different slice per column so the three don't show the same films
        // side by side, wrapping if the pool is short.
        art: Array.from(
          { length: PER_COLUMN },
          (_, n) => posters[(i * PER_COLUMN + n) % Math.max(posters.length, 1)],
        ).filter(Boolean),
      })),
    [posters],
  );

  if (!posters.length) return null;

  return (
    <div className={`auth-marquee ${className}`} aria-hidden="true">
      {columns.map((col, i) => (
        <div key={i} className="auth-marquee-col">
          <div
            className={`auth-marquee-track${col.reverse ? " is-reverse" : ""}`}
            style={{ animationDuration: `${col.drift}s` }}
          >
            {/* Twice, so the loop has an identical second copy to slide into
                and the seam never shows. */}
            {[...col.art, ...col.art].map((src, n) => (
              // Three columns inside a modal panel, so the same sizing the
              // backdrop wall uses applies here for the same reason.
              <img
                key={`${src}-${n}`}
                src={backdropPoster(src)}
                alt=""
                loading="lazy"
                // Decoration behind the auth panel, like the backdrop wall.
                fetchPriority="low"
                decoding="async"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
