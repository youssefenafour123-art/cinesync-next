"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useTrailer } from "@/lib/useTrailer";
import { PosterImage } from "./PosterImage";
import { heroBackdrop } from "@/lib/rotation";
import { releaseLabel } from "@/lib/release";

const AUTO_ADVANCE_MS = 10_000;

/**
 * Full-bleed hero with a muted autoplaying trailer per slide.
 *
 * Only the active slide gets a live iframe src — the rest sit at
 * `about:blank`. Five simultaneously-playing YouTube embeds was a large part
 * of why the legacy tracker tab felt broken.
 */
export function HeroCarousel({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const openDetails = useAppStore((s) => s.openDetails);
  const { play } = useTrailer();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = items.length;

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Restart the clock on any manual navigation so a click isn't cut short.
  useEffect(() => {
    if (count < 2) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_ADVANCE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [count, index]);

  if (!count) return null;

  return (
    <div className="hero-carousel panel-glow">
      {items.map((item, i) => {
        const active = i === index;
        const src =
          active && item.trailerKey
            ? `https://www.youtube.com/embed/${item.trailerKey}?autoplay=1&mute=1&controls=0&rel=0&loop=1&playlist=${item.trailerKey}&modestbranding=1&playsinline=1`
            : "about:blank";

        return (
          <div key={item.key} className={`hero-slide${active ? " active" : ""}`} aria-hidden={!active}>
            <div className="hero-video-wrapper">
              {/*
                Every slide stays mounted here, so only the first one is the
                paint anybody is waiting on — the other four keep the lazy
                default rather than five backdrops racing each other.
              */}
              <PosterImage
                src={heroBackdrop(item.backdrop, item.poster)}
                alt=""
                priority={i === 0}
                className="absolute inset-0 h-full w-full object-cover opacity-60"
              />
              {item.trailerKey ? (
                <iframe
                  src={src}
                  title={`${item.title} trailer`}
                  allow="autoplay; encrypted-media"
                  tabIndex={-1}
                />
              ) : null}
            </div>

            <div className="hero-overlay" />

            <div className="hero-content">
              <div className="hero-title">{item.title}</div>
              <div className="hero-meta">
                {item.rating ? <span>★ {item.rating}</span> : null}
                <span>{releaseLabel(item)}</span>
                <span>{item.kind === "series" ? "TV" : "MOVIE"}</span>
              </div>
              <div className="hero-desc">
                {item.director ? (
                  <>
                    <strong>
                      {item.directorLabel === "Creator" || item.directorLabel === "Creators"
                        ? "Created by"
                        : "Dir"}
                      :
                    </strong>{" "}
                    {item.director}
                    <br />
                  </>
                ) : null}
                {item.cast ? (
                  <>
                    <strong>Cast:</strong> {item.cast}
                    <br />
                    <br />
                  </>
                ) : null}
                {item.description || "No plot available."}
              </div>
              <div className="hero-btns">
                <button type="button" className="hero-btn primary" onClick={() => play(item)}>
                  ▶ Play Trailer
                </button>
                <button
                  type="button"
                  className="hero-btn secondary"
                  onClick={() => openDetails(item)}
                >
                  Details
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            className="hero-nav prev"
            onClick={() => goTo(index - 1)}
          >
            &#10094;
          </button>
          <button
            type="button"
            aria-label="Next slide"
            className="hero-nav next"
            onClick={() => goTo(index + 1)}
          >
            &#10095;
          </button>
          <div className="hero-dots">
            {items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                className={`hero-dot${i === index ? " active" : ""}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
