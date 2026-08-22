"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { MoviesPayload } from "@/app/api/movies/route";
import type { MoodPayload } from "@/app/api/mood/route";
import type { MediaItem, Rail } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { TiltCard } from "@/components/ui/TiltCard";
import { PosterImage } from "@/components/ui/PosterImage";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, LoadingState } from "@/components/ui/States";

/**
 * Curated Picks.
 *
 * The legacy tab held four invented titles ("Neon Shadows", "The Monolith", …)
 * whose cards all called `openDummyDetails()`. Rails are now real TMDB data
 * ranked by weighted rating, plus a mood browser.
 */
export function MoviesTab() {
  const { data, loading, error, reload } = useFetch<MoviesPayload>("/api/movies");
  const [mood, setMood] = useState("psychological");
  const moodState = useFetch<MoodPayload>(`/api/mood?id=${mood}`);

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-10">
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          Curated Picks
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Ranked by weighted rating, so a film with nine perfect votes can&rsquo;t outrank a
          masterpiece with four thousand.
        </p>
      </div>

      {/* ---- Browse by mood ---- */}
      <section className="mb-16">
        <h2 className="mb-4 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          Browse by Mood
        </h2>

        <div className="mb-6 flex flex-wrap gap-2">
          {(moodState.data?.moods ?? []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMood(m.id)}
              aria-pressed={mood === m.id}
              className={`rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${
                mood === m.id
                  ? "bg-primary text-on-primary"
                  : "border border-white/10 bg-surface-container/50 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {moodState.error ? (
          <ErrorState message={moodState.error} onRetry={moodState.reload} />
        ) : moodState.loading ? (
          <LoadingState label="Finding the good ones…" />
        ) : moodState.data?.rail ? (
          <RailGrid rail={moodState.data.rail} />
        ) : null}
      </section>

      {/* ---- Curated rails ---- */}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <LoadingState label="Loading curated picks…" />
      ) : (
        <div className="flex flex-col gap-gutter lg:flex-row">
          <div className="flex flex-col gap-16 lg:w-3/4">
            {data?.rails.map((rail) => (
              <Reveal key={rail.title} as="section">
                <RailGrid rail={rail} />
              </Reveal>
            ))}
          </div>
          <CuratorNote />
        </div>
      )}
    </div>
  );
}

function RailGrid({ rail }: { rail: Rail }) {
  return (
    <>
      <div className="mb-6 border-b border-white/10 pb-4">
        <h2 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          {rail.title}
        </h2>
        {rail.blurb ? (
          <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">{rail.blurb}</p>
        ) : null}
      </div>

      {rail.items.length === 0 ? (
        <p className="py-10 text-center font-body-md text-body-md text-on-surface-variant">
          Nothing matched this one.
        </p>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-unit md:grid-cols-3 lg:grid-cols-4"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          initial="hidden"
          animate="show"
        >
          {rail.items.map((item) => (
            <CuratedCard key={item.key} item={item} />
          ))}
        </motion.div>
      )}
    </>
  );
}

function CuratedCard({ item }: { item: MediaItem }) {
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, rotateY: -25, y: 30 },
        show: { opacity: 1, rotateY: 0, y: 0 },
      }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      style={{ perspective: 1000 }}
    >
      <TiltCard
        onClick={() => openDetails(item)}
        className="movie-card group relative aspect-[2/3] cursor-pointer overflow-hidden rounded border border-white/5 bg-surface-container"
      >
        <PosterImage src={item.poster} alt={item.title} className="h-full w-full object-cover" />

        {inLibrary ? (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/20 bg-primary/90 px-2 py-1 text-[11px] font-bold text-[#002113] backdrop-blur-sm">
            <Icon name="check" className="text-[14px]" />
            In Library
          </div>
        ) : null}

        <div className="movie-card-overlay absolute inset-0 flex flex-col justify-end p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {item.rating ? (
              <span className="rounded-sm border border-primary/30 bg-primary/20 px-2 py-1 font-label-md text-[12px] text-primary">
                ★ {item.rating}
              </span>
            ) : null}
            {item.year ? (
              <span className="rounded-sm bg-black/50 px-2 py-1 font-label-md text-[12px] text-on-surface backdrop-blur-md">
                {item.year}
              </span>
            ) : null}
          </div>
          <h3 className="mb-1 font-title-lg text-[18px] leading-tight text-white transition-colors group-hover:text-primary">
            {item.title}
          </h3>
          <p className="line-clamp-2 font-body-md text-[13px] text-on-surface-variant">
            {item.description || "No synopsis available."}
          </p>
        </div>
      </TiltCard>
    </motion.div>
  );
}

/**
 * Editorial sidebar — static copy by design, same as the original, but signed
 * by the person who actually wrote it rather than the legacy page's invented
 * "Alex Mercer, Lead Programmer".
 */
function CuratorNote() {
  return (
    <Reveal as="aside" className="lg:mt-[140px] lg:w-1/4">
      <div className="glass-panel sticky top-32 rounded-xl border-primary/20 p-6">
        <div className="mb-6 flex items-center gap-3 border-b border-primary/20 pb-4">
          <Icon name="edit_note" className="text-[24px] text-primary" />
          <h3 className="glow-text font-title-lg text-title-lg text-primary">Curator&rsquo;s Note</h3>
        </div>
        <div className="flex flex-col gap-4">
          <p className="font-body-md text-[15px] italic leading-relaxed text-on-surface-variant">
            &ldquo;Under the Radar is the rail worth your time. It only admits films with enough
            votes for the rating to mean something, but few enough that nobody brings them up at
            dinner. That gap is where the surprises live.&rdquo;
          </p>
          <div className="mt-4 border-t border-primary/20 pt-4">
            <p className="font-display-md text-[18px] text-primary">&mdash; elwaadudi</p>
            <p className="font-body-md text-[12px] text-on-surface/60">Curator</p>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
