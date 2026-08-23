"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { TrackerPayload } from "@/app/api/tracker/route";
import type { MediaItem } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { Carousel } from "@/components/ui/Carousel";
import { HeroCarousel } from "@/components/ui/HeroCarousel";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, LoadingState, PosterSkeleton } from "@/components/ui/States";

type TrackerType = "movie" | "tv";

export function TrackerTab() {
  const [type, setType] = useState<TrackerType>("movie");
  const { data, loading, error, reload } = useFetch<TrackerPayload>(`/api/tracker?type=${type}`);

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Release Tracker
          </h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            What&rsquo;s coming, and what just landed.
          </p>
        </div>

        <div className="flex gap-2 rounded-full border border-white/10 bg-surface-container/60 p-1">
          {(["movie", "tv"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`rounded-full px-5 py-2 font-label-md text-label-md transition-colors ${
                type === t
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t === "movie" ? "Movies" : "TV Shows"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <>
          <div className="hero-carousel animate-pulse bg-surface-container-low" />
          <Carousel title="Upcoming Releases" showArrows={false}>
            <PosterSkeleton />
          </Carousel>
          <LoadingState label="Loading release tracker…" />
        </>
      ) : (
        <>
          {/* Keyed by type so switching Movies↔TV remounts at slide 0. */}
          <HeroCarousel key={type} items={data?.hero ?? []} />

          <TrackerRail title="Upcoming Releases" items={data?.upcoming ?? []} type={type} />
          <TrackerRail title="Recently Released" items={data?.released ?? []} type={type} />
        </>
      )}
    </div>
  );
}

function TrackerRail({
  title,
  items,
  type,
}: {
  title: string;
  items: MediaItem[];
  type: TrackerType;
}) {
  if (!items.length) {
    return (
      <Carousel title={title} showArrows={false}>
        <EmptyState
          message={`No ${type === "movie" ? "movie" : "TV"} titles in this window right now.`}
          icon="event_busy"
        />
      </Carousel>
    );
  }

  return (
    <Carousel title={title}>
      <motion.div
        className="flex gap-[18px]"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        initial="hidden"
        animate="show"
      >
        {items.map((item) => (
          <TrackerCard key={item.key} item={item} />
        ))}
      </motion.div>
    </Carousel>
  );
}

/** Wider card than the standard rail: the tracker shows date, crew and plot. */
function TrackerCard({ item }: { item: MediaItem }) {
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="carousel-item cursor-pointer"
      onClick={() => openDetails(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails(item);
        }
      }}
      aria-label={`Open details for ${item.title}`}
    >
      <div className="carousel-poster">
        <PosterImage src={item.poster}
          variants={item.posters} alt={item.title} className="h-full w-full object-cover" />
        {item.rating ? <div className="carousel-badge">★ {item.rating}</div> : null}
        {inLibrary ? (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-white/20 bg-primary/90 px-2 py-1 text-[11px] font-bold text-[#002113] backdrop-blur-sm">
            <Icon name="check" className="text-[14px]" />
            In Library
          </div>
        ) : null}
      </div>
      <div className="carousel-info">
        <div className="carousel-name">{item.title}</div>
        {/*
           Same rule as the details panel: a day only where one has been
           announced, otherwise the year. A tracker that prints invented dates
           is worse than one that admits it only knows the year.
        */}
        <div className="carousel-date">
          {item.releaseIso && !item.releaseConfirmed
            ? item.releaseIso.slice(0, 4)
            : (item.releaseDate ?? "TBA")}
        </div>
        {item.director || item.cast ? (
          <div className="carousel-desc mt-1.5 font-semibold text-white/85">
            {item.director ? (
              <>
                {item.directorLabel === "Creator" || item.directorLabel === "Creators"
                  ? "Created by"
                  : "Dir"}
                : {item.director}
                <br />
              </>
            ) : null}
            {item.cast ? `Cast: ${item.cast}` : null}
          </div>
        ) : null}
        <div className="carousel-desc">{item.description || "No plot available."}</div>
      </div>
    </motion.div>
  );
}
