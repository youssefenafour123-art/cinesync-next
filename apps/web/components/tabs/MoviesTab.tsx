"use client";

import { useState } from "react";
import type { MoviesPayload } from "@/app/api/movies/route";
import type { MoodPayload } from "@/app/api/mood/route";
import { useFetch } from "@/lib/useFetch";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { RailGrid } from "@/components/ui/RailGrid";
import { FindSimilar } from "@/components/ui/FindSimilar";

/**
 * Curated Picks.
 *
 * The legacy tab held four invented titles ("Neon Shadows", "The Monolith", …)
 * whose cards all called `openDummyDetails()`. Rails are now real TMDB data
 * ranked by weighted rating, plus a mood browser.
 */
type Catalogue = "movie" | "tv";

export function MoviesTab() {
  const [type, setType] = useState<Catalogue>("movie");
  const { data, loading, error, reload } = useFetch<MoviesPayload>(`/api/movies?type=${type}`);
  const [mood, setMood] = useState("psychological");
  const moodState = useFetch<MoodPayload>(`/api/mood?id=${mood}&type=${type}`);

  const moods = moodState.data?.moods ?? [];
  /*
     Which chip reads as selected.

     Not simply `mood`: some moods have no series equivalent — Horror is the
     one, TMDB has no such genre for television — so switching to Series while
     one of those is picked leaves `mood` naming something the catalogue no
     longer offers. The route falls back to the first available mood in that
     case, and this falls back the same way, so the highlighted chip is always
     the rail actually being shown.
  */
  const activeMood = moods.some((m) => m.id === mood) ? mood : (moods[0]?.id ?? mood);

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Curated Picks
          </h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Ranked by weighted rating, so {type === "movie" ? "a film" : "a show"} with nine perfect
            votes can&rsquo;t outrank {type === "movie" ? "a masterpiece" : "a classic"} with four
            thousand.
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

      <FindSimilar />

      {/* ---- Browse by mood ---- */}
      <section className="mb-16">
        <h2 className="mb-4 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          Browse by Mood
        </h2>

        <div className="mb-6 flex flex-wrap gap-2">
          {moods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMood(m.id)}
              aria-pressed={activeMood === m.id}
              className={`rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${
                activeMood === m.id
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
        ) : moodState.loading && !moodState.data ? (
          <LoadingState label="Finding the good ones…" />
        ) : moodState.data?.rail ? (
          // The only expandable rail. The curated three below deliberately
          // keep their rotating window of twelve.
          <RailGrid rail={moodState.data.rail} expandable />
        ) : null}
      </section>

      {/* ---- Curated rails ---- */}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingState label={type === "movie" ? "Loading curated films…" : "Loading curated series…"} />
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
