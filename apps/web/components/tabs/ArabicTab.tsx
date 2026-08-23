"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ArabicPayload } from "@/app/api/arabic/route";
import type { Rail } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { Carousel } from "@/components/ui/Carousel";
import { PosterCard } from "@/components/ui/PosterCard";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, PosterSkeleton } from "@/components/ui/States";

/**
 * Arabic cinema and television, browsable by country and genre.
 *
 * The rails come back already filtered to titles Stremio can actually resolve
 * — see `lib/arabic.ts` — so every card here is one whose "Add to Library"
 * ends with the title appearing in the user's Stremio library rather than an
 * unopenable row. That filtering is why a narrow selection can legitimately
 * come back empty, and why the empty state says which of the two filters to
 * loosen instead of just reporting nothing found.
 */
export function ArabicTab() {
  const [country, setCountry] = useState("all");
  const [genre, setGenre] = useState("all");

  const { data, loading, error, reload } = useFetch<ArabicPayload>(
    `/api/arabic?country=${country}&genre=${genre}`,
  );

  // The chip catalogues ship with every response, so they survive a reload of
  // the rails and the chips never blank out between selections.
  const countries = data?.countries ?? [];
  const genres = data?.genres ?? [];
  const activeCountry = countries.find((c) => c.id === country);

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Arabic Cinema
          </h1>
          <span dir="rtl" lang="ar" className="font-headline-lg text-[22px] text-primary">
            السينما العربية
          </span>
        </div>
        <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">
          Egyptian, Moroccan, Lebanese and Syrian film and television, plus the wider region.
          Everything on this tab is checked against Stremio&rsquo;s own catalogue first, so
          &ldquo;Add to Library&rdquo; lands somewhere you can actually watch it.
        </p>
      </div>

      {/* ---- Country ---- */}
      <section className="mb-6">
        <h2 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">
          Country
        </h2>
        <div className="flex flex-wrap gap-2">
          {countries.map((c) => {
            const on = country === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCountry(c.id)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${
                  on
                    ? "bg-primary text-on-primary"
                    : "border border-white/10 bg-surface-container/50 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
                }`}
              >
                {c.label}
                <span
                  dir="rtl"
                  lang="ar"
                  className={on ? "text-on-primary/70" : "text-on-surface-variant/50"}
                >
                  {c.arabic}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Genre ---- */}
      <section className="mb-10">
        <h2 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">
          Genre
        </h2>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => {
            const on = genre === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGenre(g.id)}
                aria-pressed={on}
                className={`rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${
                  on
                    ? "bg-primary text-on-primary"
                    : "border border-white/10 bg-surface-container/50 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </section>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <>
          <Carousel title="Arabic Films" showArrows={false}>
            <PosterSkeleton />
          </Carousel>
          <Carousel title="Arabic Series" showArrows={false}>
            <PosterSkeleton />
          </Carousel>
        </>
      ) : (
        /*
          Keyed on the selection so the rails cross-fade when the chips change
          rather than swapping their contents in place — with the poster art
          being the only thing that changes between two selections, an
          unanimated swap reads as the page glitching.
        */
        <AnimatePresence mode="wait">
          <motion.div
            key={`${country}-${genre}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* A stale rail is dimmed while the next selection loads, so the
                chips respond instantly even though the data does not. */}
            <div className={loading ? "pointer-events-none opacity-50 transition-opacity" : ""}>
              {(data?.rails ?? []).map((rail) => (
                <ArabicRail
                  key={rail.title}
                  rail={rail}
                  countryLabel={activeCountry?.label ?? "the Arab world"}
                />
              ))}
              <ArabicFootnote />
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function ArabicRail({ rail, countryLabel }: { rail: Rail; countryLabel: string }) {
  const title = (
    <div className="flex flex-col gap-1">
      <span>{rail.title}</span>
      {rail.blurb ? (
        <span className="font-body-md text-[13px] font-normal text-on-surface-variant">
          {rail.blurb}
        </span>
      ) : null}
    </div>
  );

  if (!rail.items.length) {
    return (
      <Carousel title={title} showArrows={false}>
        <EmptyState
          message={`Nothing from ${countryLabel} in this genre is carried by Stremio yet — try a broader genre, or All Arabic.`}
          icon="travel_explore"
        />
      </Carousel>
    );
  }

  return (
    <Carousel title={title}>
      <motion.div
        className="flex gap-[18px]"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        initial="hidden"
        animate="show"
      >
        {rail.items.map((item) => (
          <PosterCard key={item.key} item={item} />
        ))}
      </motion.div>
    </Carousel>
  );
}

/** Small note explaining the Stremio guarantee, shown under the rails. */
function ArabicFootnote() {
  return (
    <p className="mt-4 flex items-start gap-2 font-body-md text-[13px] text-on-surface-variant/70">
      <Icon name="verified" className="mt-0.5 text-[16px] text-primary/70" />
      Titles are matched to Stremio through their IMDb id and confirmed against Cinemeta before
      they appear here.
    </p>
  );
}
