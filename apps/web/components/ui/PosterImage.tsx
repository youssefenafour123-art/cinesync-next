"use client";

import { useState } from "react";

interface PosterImageProps {
  src?: string;
  alt: string;
  className?: string;
}

/**
 * Poster with a graceful fallback. Third-party poster hosts (metahub, TMDB)
 * 404 often enough that the legacy markup pointed `onerror` at `/logo.png`,
 * which frequently 404'd too. This falls back to a rendered placeholder that
 * can never fail.
 */
export function PosterImage({ src, alt, className = "" }: PosterImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
