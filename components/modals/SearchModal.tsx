"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { SearchResults } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useModalBehavior } from "@/lib/useModalBehavior";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";
import { PosterImage } from "@/components/ui/PosterImage";

const DEBOUNCE_MS = 350;

/**
 * Global search across films, series and people (actors, directors, writers).
 * Backed by TMDB multi-search, so one query covers all of them.
 */
export function SearchModal() {
  const close = useAppStore((s) => s.setSearchOpen);
  const openDetails = useAppStore((s) => s.openDetails);
  const openPerson = useAppStore((s) => s.openPerson);
  const libraryIds = useAppStore((s) => s.libraryIds);

  const dismiss = () => close(false);
  const z = useModalBehavior(dismiss);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading, error } = useFetch<SearchResults>(
    debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );

  const titles = data?.titles ?? [];
  const people = data?.people ?? [];
  const empty = debounced.length >= 2 && !loading && !titles.length && !people.length;

  return (
    <motion.div
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-start justify-center p-4 pt-[10vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={dismiss} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-container-high shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Icon name="search" className="shrink-0 text-on-surface-variant" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search films, series, actors, directors, writers…"
            aria-label="Search films, series and people"
            className="flex-1 bg-transparent font-body-md text-body-md text-on-surface outline-none placeholder:text-on-surface-variant/60"
          />
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close search"
            className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[11px] text-on-surface-variant transition-colors hover:text-on-surface"
          >
            ESC
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
          {debounced.length < 2 ? (
            <p className="px-3 py-10 text-center font-body-md text-body-md text-on-surface-variant">
              Type at least two characters.
            </p>
          ) : loading && !data ? (
            <p className="pulsing-text px-3 py-10 text-center font-label-md text-label-md text-on-surface-variant">
              Searching…
            </p>
          ) : error ? (
            <p className="px-3 py-10 text-center font-label-md text-label-md text-error">{error}</p>
          ) : empty ? (
            <p className="px-3 py-10 text-center font-body-md text-body-md text-on-surface-variant">
              Nothing found for &ldquo;{debounced}&rdquo;.
            </p>
          ) : (
            <>
              {people.length > 0 && (
                <Section label="People">
                  {people.map((p) => (
                    <button
                      key={p.tmdbId}
                      type="button"
                      onClick={() => openPerson(p.tmdbId)}
                      className="flex w-full items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.08]"
                    >
                      <PosterImage
                        src={p.profile}
                        alt={p.name}
                        className="h-14 w-14 shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-title-lg text-[15px] text-white">{p.name}</div>
                        <div className="truncate text-[13px] text-on-surface-variant">
                          {p.department ?? "Film"}
                          {p.knownFor ? ` · ${p.knownFor}` : ""}
                        </div>
                      </div>
                      <Icon name="chevron_right" className="shrink-0 text-on-surface-variant" />
                    </button>
                  ))}
                </Section>
              )}

              {titles.length > 0 && (
                <Section label="Films & Series">
                  {titles.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        openDetails(t);
                        dismiss();
                      }}
                      className="flex w-full items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.08]"
                    >
                      <PosterImage
                        src={t.poster}
                        alt={t.title}
                        className="h-[72px] w-12 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-title-lg text-[15px] text-white">
                          {t.title}
                        </div>
                        <div className="truncate text-[13px] text-on-surface-variant">
                          {t.year ?? "TBA"} · {t.kind === "series" ? "Series" : "Movie"}
                          {t.rating ? ` · ★ ${t.rating}` : ""}
                          {t.director ? ` · ${t.director}` : ""}
                        </div>
                      </div>
                      {t.imdbId && libraryIds.has(t.imdbId) ? (
                        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary">
                          In Library
                        </span>
                      ) : null}
                    </button>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="px-2 pb-2 font-label-md text-label-md uppercase tracking-widest text-primary">
        {label}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
