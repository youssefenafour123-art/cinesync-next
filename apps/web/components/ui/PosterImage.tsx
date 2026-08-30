"use client";

import { useMemo, useState } from "react";
import { posterVariant, sizedPoster } from "@/lib/rotation";

interface PosterImageProps {
  src?: string;
  /**
   * Community artwork to rotate through, best-voted first. Where a route
   * supplies it, one is chosen per page load; where it doesn't, `src` is used
   * unchanged.
   */
  variants?: string[];
  alt: string;
  className?: string;
  /**
   * This image is the page's largest paint — load it now, ahead of the rest.
   *
   * Everything here is `loading="lazy"`, which is right for a rail of a dozen
   * posters and wrong for the one image the hero is built around: the browser
   * defers a lazy image until layout has told it the element is in view, and
   * by then it is queued behind however many posters were discovered first.
   * Measured on a throttled connection against production, the hero backdrop
   * was the LCP element and arrived at **18.3 seconds**.
   *
   * `fetchpriority="high"` is the other half. Eager alone only moves the
   * request earlier in the queue; the hint moves it to the front of it.
   */
  priority?: boolean;
  /**
   * Fired once the image is up, or once it has failed and the placeholder is
   * standing in for it. The hero uses it to hold its first advance until there
   * is something to look at.
   */
  onReady?: () => void;
}

/**
 * Poster with a graceful fallback. Third-party poster hosts (metahub, TMDB)
 * 404 often enough that the legacy markup pointed `onerror` at `/logo.png`,
 * which frequently 404'd too. This falls back to a rendered placeholder that
 * can never fail.
 */
export function PosterImage({
  src,
  variants,
  alt,
  className = "",
  priority = false,
  onReady,
}: PosterImageProps) {
  const [failed, setFailed] = useState(false);
  const chosen = useMemo(() => sizedPoster(posterVariant(src, variants)), [src, variants]);

  if (!chosen || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-container text-on-surface-variant/40 ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="material-symbols-outlined text-4xl">movie</span>
      </div>
    );
  }

  return (
    // Posters come from arbitrary remote hosts, so next/image's optimiser
    // would need every domain allow-listed; a plain img keeps them working.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // `key` so a different variant remounts the element rather than swapping
      // the URL under a stale `failed` flag — one dead poster must not blank
      // the replacement chosen on the next load.
      key={chosen}
      src={chosen}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      // Off the main thread. Without it the browser decodes synchronously
      // during layout, and a rail commits a dozen of these at once.
      decoding="async"
      className={className}
      onLoad={onReady}
      onError={() => {
        setFailed(true);
        // A dead poster still counts as settled — whatever is waiting on this
        // must not wait on an image that is never coming.
        onReady?.();
      }}
    />
  );
}
