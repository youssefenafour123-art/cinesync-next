"use client";

import { useMemo, useState } from "react";
import { posterVariant, sizedPoster } from "@/lib/posterVariant";

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
}

/**
 * Poster with a graceful fallback. Third-party poster hosts (metahub, TMDB)
 * 404 often enough that the legacy markup pointed `onerror` at `/logo.png`,
 * which frequently 404'd too. This falls back to a rendered placeholder that
 * can never fail.
 */
export function PosterImage({ src, variants, alt, className = "" }: PosterImageProps) {
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
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
