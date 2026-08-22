"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AnimePayload } from "@/app/api/anime/route";
import type { AnimeSearchPayload } from "@/app/api/anime/search/route";
import type { MediaItem } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { Carousel } from "@/components/ui/Carousel";
import { PosterCard } from "@/components/ui/PosterCard";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, LoadingState, PosterSkeleton } from "@/components/ui/States";

const DEBOUNCE_MS = 400;

export function AnimeTab() {
  const { data, loading, error, reload } = useFetch<AnimePayload>("/api/anime");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce so a fast typist doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = useFetch<AnimeSearchPayload>(
    debounced ? `/api/anime/search?q=${encodeURIComponent(debounced)}` : null,
  );

  // Dismiss the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Anime Hub
          </h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Japanese animation, ranked by IMDb where a rating exists.
          </p>
        </div>

        <div ref={boxRef} className="relative w-full sm:w-[340px]">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
          />
          <input
            type="text"
            value={query}
            placeholder="Search anime…"
            aria-label="Search anime"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="search-input w-full pl-11 pr-10"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setOpen(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-primary"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          ) : null}

          <AnimatePresence>
            {open && debounced ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="custom-scrollbar absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d0f] shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
              >
                <SearchResults
                  loading={search.loading}
                  error={search.error}
                  items={search.data?.items ?? []}
                  query={debounced}
                  onPick={() => setOpen(false)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <>
          <Carousel title="Top Rated Anime" showArrows={false}>
            <PosterSkeleton />
          </Carousel>
          <LoadingState label="Loading anime…" />
        </>
      ) : (
        data?.rails.map((rail) => (
          <Carousel key={rail.title} title={rail.title}>
            <motion.div
              className="flex gap-[18px]"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              initial="hidden"
              animate="show"
            >
              {rail.items.length ? (
                rail.items.map((item) => <PosterCard key={item.key} item={item} />)
              ) : (
                <EmptyState message="Nothing in this rail right now." />
              )}
            </motion.div>
          </Carousel>
        ))
      )}
    </div>
  );
}

function SearchResults({
  loading,
  error,
  items,
  query,
  onPick,
}: {
  loading: boolean;
  error: string | null;
  items: MediaItem[];
  query: string;
  onPick: () => void;
}) {
  const openDetails = useAppStore((s) => s.openDetails);

  if (loading) {
    return (
      <div className="pulsing-text p-6 text-center font-label-md text-label-md text-on-surface-variant">
        Searching anime…
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-center font-label-md text-label-md text-error">{error}</div>;
  }

  if (!items.length) {
    return (
      <div className="p-6 text-center font-label-md text-label-md text-on-surface-variant">
        No anime found for &ldquo;{query}&rdquo;
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => {
            openDetails(item);
            onPick();
          }}
          className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.08]"
        >
          <PosterImage
            src={item.poster}
            alt={item.title}
            className="h-[72px] w-12 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-title-lg text-[15px] text-white">{item.title}</div>
            <div className="mt-0.5 text-[13px] text-on-surface-variant">
              {item.year ?? "TBA"} • TV{item.rating ? ` • ★ ${item.rating}` : ""}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
