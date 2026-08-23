"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MediaItem, SearchResults } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useModalBehavior } from "@/lib/useModalBehavior";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";
import { PosterImage } from "@/components/ui/PosterImage";

const DEBOUNCE_MS = 350;
/** Rows shown before the query is submitted. */
const QUICK_LIMIT = 6;
const RECENT_KEY = "cinesync:recent-searches";
const RECENT_MAX = 8;

function loadRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private-mode storage failures shouldn't break search.
  }
}

/**
 * Global search across films, series and people (actors, directors, writers).
 * Backed by TMDB multi-search, so one query covers all of them.
 *
 * Two modes. Typing gives a short list of the best matches as you go; pressing
 * Enter commits the query and opens the full list of everything that matched,
 * which is what makes a title outside the top few reachable at all. The API
 * returns the whole set in one response, so submitting is instant rather than a
 * second round trip — enrichment there runs in parallel, costing latency once
 * instead of once per title.
 *
 * Past queries are kept locally and offered when the box is empty.
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
  /** The query the user pressed Enter on; null while still typing. */
  const [submitted, setSubmitted] = useState<string | null>(null);
  // Read straight out of storage on first render. `loadRecent` swallows the
  // ReferenceError a server render would throw, and this modal only ever mounts
  // from a user action anyway, so there is no markup to mismatch.
  const [recent, setRecent] = useState<string[]>(loadRecent);
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

  const run = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;

    setQuery(trimmed);
    // Skip the debounce: Enter should not wait another 350ms for a request it
    // has usually already made.
    setDebounced(trimmed);
    setSubmitted(trimmed);

    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        RECENT_MAX,
      );
      saveRecent(next);
      return next;
    });
  }, []);

  const titles = data?.titles ?? [];
  const people = data?.people ?? [];
  /*
     Derived, not synced.

     The expanded view belongs to the query that was submitted, so it is simply
     "the submitted query is still the one in the box, and the results on screen
     are for it". Editing a character makes that false and the list collapses on
     its own — no effect resetting `submitted` behind the render, which React
     flags as a cascading render and which would also flicker for one frame.
  */
  const expanded = submitted !== null && submitted === query.trim() && submitted === debounced;
  const shownTitles = expanded ? titles : titles.slice(0, QUICK_LIMIT);
  const shownPeople = expanded ? people : people.slice(0, 3);
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
        // Grows when the results are expanded, so a full list has room to be a
        // list rather than a peephole.
        className={`relative flex w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-container-high shadow-2xl transition-[max-width] duration-300 ${
          expanded ? "max-h-[84vh] max-w-4xl" : "max-h-[78vh] max-w-2xl"
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
          className="flex items-center gap-3 border-b border-white/10 px-5 py-4"
        >
          <Icon name="search" className="shrink-0 text-on-surface-variant" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search films, series, actors, directors, writers…"
            aria-label="Search films, series and people"
            // Enter submits through the form, so the browser's own "go" on a
            // soft keyboard works the same way.
            enterKeyHint="search"
            className="flex-1 bg-transparent font-body-md text-body-md text-on-surface outline-none placeholder:text-on-surface-variant/60"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSubmitted(null);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="shrink-0 text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close search"
            className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[11px] text-on-surface-variant transition-colors hover:text-on-surface"
          >
            ESC
          </button>
        </form>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
          {debounced.length < 2 ? (
            <RecentSearches
              recent={recent}
              onPick={run}
              onClear={() => {
                setRecent([]);
                saveRecent([]);
              }}
            />
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
              {expanded ? (
                <div className="mb-3 flex items-center justify-between gap-3 px-2">
                  <h2 className="font-title-lg text-[15px] text-on-surface">
                    {titles.length + people.length} results for{" "}
                    <span className="text-primary">&ldquo;{submitted}&rdquo;</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSubmitted(null)}
                    className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    Show fewer
                  </button>
                </div>
              ) : null}

              {shownPeople.length > 0 && (
                <Section label="People">
                  {shownPeople.map((p) => (
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

              {shownTitles.length > 0 && (
                <Section label="Films &amp; Series">
                  {shownTitles.map((t) => (
                    <TitleRow
                      key={t.key}
                      item={t}
                      inLibrary={Boolean(t.imdbId && libraryIds.has(t.imdbId))}
                      onOpen={() => {
                        openDetails(t);
                        dismiss();
                      }}
                    />
                  ))}
                </Section>
              )}

              {/* The way out of the top-few list, and the reason an unreleased
                  title that ranks below the fold is reachable at all. */}
              {!expanded && titles.length + people.length > shownTitles.length + shownPeople.length ? (
                <button
                  type="button"
                  onClick={() => run(debounced)}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Show all {titles.length + people.length} results
                  <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px]">
                    Enter
                  </kbd>
                </button>
              ) : null}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TitleRow({
  item,
  inLibrary,
  onOpen,
}: {
  item: MediaItem;
  inLibrary: boolean;
  onOpen: () => void;
}) {
  // A title dated in the future is the case this modal used to hide entirely,
  // so it is called out rather than left to be inferred from the year.
  const upcoming = isUpcoming(item);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.08]"
    >
      <PosterImage
        src={item.poster}
        alt={item.title}
        className="h-[72px] w-12 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-title-lg text-[15px] text-white">{item.title}</span>
          {upcoming ? (
            <span className="shrink-0 rounded-full border border-secondary/40 bg-secondary-container/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
              Upcoming
            </span>
          ) : null}
        </div>
        <div className="truncate text-[13px] text-on-surface-variant">
          {item.year ?? "TBA"} · {item.kind === "series" ? "Series" : "Movie"}
          {item.rating ? ` · ★ ${item.rating}` : ""}
          {item.director ? ` · ${item.director}` : ""}
        </div>
      </div>
      {inLibrary ? (
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary">
          In Library
        </span>
      ) : null}
    </button>
  );
}

/**
 * Dated in the future.
 *
 * Prefers the actual release date over the year, because comparing years alone
 * calls a film releasing this December "released" for the eleven months it is
 * not. `releaseDate` is the formatted string TMDB items carry ("Dec 16, 2026")
 * and is literally "TBA" for an announced title with no date, which falls
 * through to the year comparison.
 */
function isUpcoming(item: MediaItem): boolean {
  if (item.releaseDate && item.releaseDate !== "TBA") {
    const when = new Date(item.releaseDate);
    if (!Number.isNaN(when.getTime())) return when.getTime() > Date.now();
  }
  const year = Number(item.year);
  return Number.isFinite(year) && year >= new Date().getFullYear();
}

function RecentSearches({
  recent,
  onPick,
  onClear,
}: {
  recent: string[];
  onPick: (term: string) => void;
  onClear: () => void;
}) {
  if (!recent.length) {
    return (
      <p className="px-3 py-10 text-center font-body-md text-body-md text-on-surface-variant">
        Type at least two characters, then press{" "}
        <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[11px]">Enter</kbd> for the
        full list.
      </p>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-2 pb-2">
        <h3 className="font-label-md text-label-md uppercase tracking-widest text-primary">
          Recent searches
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-on-surface-variant transition-colors hover:text-on-surface"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2 px-2">
        <AnimatePresence initial={false}>
          {recent.map((term) => (
            <motion.button
              key={term}
              type="button"
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => onPick(term)}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Icon name="history" className="text-[15px]" />
              {term}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="px-2 pb-2 font-label-md text-label-md uppercase tracking-widest text-primary">
        {label}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
