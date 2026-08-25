"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSourcesStore, stremioAccounts } from "@/store/useSourcesStore";
import { useLibraryActions } from "@/lib/useLibraryActions";
import { useLibraryRefresh } from "@/lib/useLibrarySync";
import { SavedTitleGrid } from "@/components/ui/SavedTitleGrid";
import { Icon } from "@/components/ui/Icon";

/** Shown before "Show all". A library of three hundred is not a page. */
const PAGE = 18;

type Filter = "all" | "movie" | "series";

/**
 * The connected Stremio library, on the website.
 *
 * Everything needed to render this was already arriving on every refresh and
 * being discarded: `fetchLibrarySnapshot` reduced each row to an id, which is
 * all a poster badge needs, so the app knew *that* you owned three hundred
 * titles and not *which*. The rows now keep their name and poster, at no extra
 * request.
 *
 * Removing writes straight back to Stremio through `useLibraryActions`, the
 * same path the details modal uses — and the same one that keeps `known`
 * intact, so a title deleted here is not resurrected by the next sync of
 * whichever IMDb list it came from.
 */
export function StremioLibrary() {
  const items = useAppStore((s) => s.libraryItems);
  const loaded = useAppStore((s) => s.libraryLoaded);
  const sources = useSourcesStore((s) => s.sources);
  const { remove, removing } = useLibraryActions();
  const { refresh, pending: refreshing } = useLibraryRefresh();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);

  const connected = stremioAccounts(sources).length > 0;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (e) =>
        (filter === "all" || e.kind === filter) && (!q || e.title.toLowerCase().includes(q)),
    );
  }, [items, query, filter]);

  // Nothing at all when no Stremio account is linked. The Library tab already
  // says where to connect one; a second empty panel repeating it is noise.
  if (!connected) return null;

  const counts = {
    all: items.length,
    movie: items.filter((e) => e.kind === "movie").length,
    series: items.filter((e) => e.kind === "series").length,
  };

  return (
    <section className="mb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-title-lg text-title-lg text-on-surface">In your Stremio library</h3>
          <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
            {loaded
              ? `${counts.all} ${counts.all === 1 ? "title" : "titles"} across your connected accounts.`
              : "Reading your library…"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex shrink-0 items-center gap-2 rounded-full bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-60"
        >
          <Icon name="refresh" className={`text-[18px] ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loaded && items.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
            />
            <label className="sr-only" htmlFor="library-filter">
              Filter your library by title
            </label>
            <input
              id="library-filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title…"
              className="w-full rounded-full border border-white/10 bg-surface-container/60 py-2.5 pl-10 pr-4 font-body-md text-[14px] text-on-surface outline-none ring-primary/60 transition-colors placeholder:text-on-surface-variant focus-visible:border-primary/40 focus-visible:ring-2"
            />
          </div>

          <div className="flex gap-1 rounded-full border border-white/10 bg-surface-container/60 p-1">
            {(["all", "movie", "series"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-4 py-1.5 font-label-md text-[13px] transition-colors ${
                  filter === f
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {f === "all" ? "All" : f === "movie" ? "Films" : "Shows"} {counts[f]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!loaded ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
          Your Stremio library is empty, or it hasn&rsquo;t been read yet. Press Refresh.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
          Nothing in your library matches that.
        </p>
      ) : (
        <>
          <SavedTitleGrid
            items={expanded ? shown : shown.slice(0, PAGE)}
            onRemove={(t) => void remove({ imdbId: t.imdbId, title: t.title, kind: t.kind })}
            removeLabel={(t) => `Remove ${t.title} from your Stremio library`}
            removeIcon="delete"
            busy={removing}
          />

          {shown.length > PAGE ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-6 font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
            >
              {expanded ? "Show fewer" : `Show all ${shown.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
