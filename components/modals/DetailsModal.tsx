"use client";

import { useEffect, useState } from "react";
import type { CreditedPerson, MediaItem } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useAddToLibrary } from "@/lib/useAddToLibrary";
import { useTrailer } from "@/lib/useTrailer";
import { PosterImage } from "@/components/ui/PosterImage";
import { ScoresPanel } from "@/components/ui/ScoresPanel";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "./ModalShell";

/**
 * Details panel for one title.
 *
 * This is the fix for the headline bug: the legacy `openDetails()` wrote into
 * `#detailsTitle`, `#detailsPlot`, `#detailsPoster`, `#detailsMeta` and
 * `#detailsBg` — none of which existed in the document — so every card in the
 * app opened the same hardcoded Oppenheimer markup. Here the item is passed in
 * as a prop and rendered directly.
 */
export function DetailsModal({ item }: { item: MediaItem }) {
  const close = useAppStore((s) => s.closeDetails);
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));
  const { add, pending } = useAddToLibrary();
  const { play } = useTrailer();

  // List endpoints carry no plot/genres/credits for some titles. Cinemeta
  // fills in the prose; /api/enrich supplies TMDB credits with person ids so
  // the cast and director are clickable even for Cinemeta-sourced items.
  const [fetched, setFetched] = useState<{ key: string; meta: MediaItem } | null>(null);

  useEffect(() => {
    if (!item.imdbId && !item.tmdbId) return;

    let cancelled = false;
    const url = item.imdbId
      ? `/api/enrich?imdb=${item.imdbId}&kind=${item.kind}`
      : `/api/enrich?tmdb=${item.tmdbId}&kind=${item.kind}`;

    void fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((meta: MediaItem | null) => {
        if (!cancelled && meta) setFetched({ key: item.key, meta });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [item.imdbId, item.tmdbId, item.kind, item.key]);

  // The list item wins wherever it has a value — its poster is the textless
  // art we deliberately picked during enrichment.
  const full: MediaItem =
    fetched?.key === item.key
      ? ({
          ...fetched.meta,
          ...Object.fromEntries(
            Object.entries(item).filter(([, v]) => v !== undefined && v !== ""),
          ),
        } as MediaItem)
      : item;

  const meta = [full.year, full.genres?.slice(0, 3).join(", "), full.runtime].filter(Boolean);

  return (
    <ModalShell
      onClose={close}
      label={`Details for ${full.title}`}
      className="glass-panel max-w-6xl rounded-xl md:flex-row"
    >
      {/* Backdrop wash */}
      {full.backdrop ? (
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-25">
          <PosterImage src={full.backdrop} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/80 to-transparent" />
        </div>
      ) : null}

      {/* Mobile poster header */}
      <div className="relative h-[38vh] w-full shrink-0 md:hidden">
        <PosterImage src={full.poster} alt={full.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent" />
      </div>

      {/* Desktop poster + actions */}
      <div className="hidden w-[340px] shrink-0 self-start p-8 md:block">
        <div className="aspect-[2/3] overflow-hidden rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
          <PosterImage src={full.poster} alt={full.title} className="h-full w-full object-cover" />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <ActionButtons
            item={full}
            inLibrary={inLibrary}
            pending={pending}
            onPlay={() => play(full)}
            onAdd={() => add(full)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-10 md:pl-4">
        {meta.length ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 font-label-md text-label-md uppercase tracking-widest text-primary opacity-80">
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-3">
                {i > 0 ? <span className="h-1 w-1 rounded-full bg-primary" /> : null}
                {m}
              </span>
            ))}
          </div>
        ) : null}

        <h1 className="mb-4 font-display-md text-headline-lg leading-tight text-on-surface md:text-display-md">
          {full.title}
        </h1>

        <div className="mb-8 flex flex-wrap items-center gap-6 border-b border-white/10 pb-6">
          {full.director ? (
            <div>
              <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
                Director
              </span>
              <span className="font-body-md text-body-md text-on-surface">{full.director}</span>
            </div>
          ) : null}

          {full.rating ? (
            <div>
              <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
                Score
              </span>
              <div className="flex items-center gap-2">
                <Icon name="star" className="text-[#f5c518]" fill />
                <span className="font-body-md text-body-md font-bold text-on-surface">
                  {full.rating}
                </span>
                <span className="text-sm text-on-surface-variant">/ 10</span>
              </div>
            </div>
          ) : null}

          <div>
            <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
              Type
            </span>
            <span className="font-body-md text-body-md text-on-surface">
              {full.kind === "series" ? "Series" : "Movie"}
            </span>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
            Synopsis
          </h3>
          <p className="font-body-lg text-body-lg leading-relaxed text-on-surface-variant">
            {full.description || "No synopsis available for this title."}
          </p>
        </div>

        <CreditChips people={full.people} fallbackCast={full.cast} />

        <ScoresPanel imdbId={full.imdbId} tmdbId={full.tmdbId} kind={full.kind} />

        {full.genres?.length ? (
          <div className="mb-8">
            <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
              Genres
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {full.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 font-label-md text-[13px] text-primary"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Mobile actions live at the end of the scroll area */}
        <div className="flex flex-col gap-3 md:hidden">
          <ActionButtons
            item={full}
            inLibrary={inLibrary}
            pending={pending}
            onPlay={() => play(full)}
            onAdd={() => add(full)}
          />
        </div>

        {full.imdbId ? (
          <a
            href={`https://www.imdb.com/title/${full.imdbId}/`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
          >
            View on IMDb
            <Icon name="open_in_new" className="text-[16px]" />
          </a>
        ) : null}
      </div>
    </ModalShell>
  );
}

/**
 * Cast and crew as clickable chips. Falls back to plain text when we only have
 * names (a Cinemeta item whose TMDB match couldn't be resolved).
 */
function CreditChips({
  people,
  fallbackCast,
}: {
  people?: CreditedPerson[];
  fallbackCast?: string;
}) {
  const openPerson = useAppStore((s) => s.openPerson);

  if (!people?.length) {
    if (!fallbackCast) return null;
    return (
      <div className="mb-8">
        <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
          Top Cast
        </h3>
        <div className="flex flex-wrap gap-2.5">
          {fallbackCast.split(",").map((name) => (
            <span
              key={name}
              className="rounded-full border border-white/10 bg-surface/50 px-4 py-2 font-label-md text-label-md text-on-surface"
            >
              {name.trim()}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const crew = people.filter((p) => p.isCrew);
  const cast = people.filter((p) => !p.isCrew);

  const chip = (p: CreditedPerson) => (
    <button
      key={`${p.tmdbId}-${p.role}`}
      type="button"
      onClick={() => openPerson(p.tmdbId)}
      title={`View ${p.name}'s profile`}
      className="flex items-center gap-3 rounded-full border border-white/10 bg-surface/50 py-1.5 pl-1.5 pr-4 transition-colors hover:border-primary/40 hover:bg-white/10"
    >
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-container">
        <PosterImage src={p.profile} alt={p.name} className="h-full w-full object-cover" />
      </span>
      <span className="text-left">
        <span className="block font-label-md text-label-md leading-tight text-on-surface">
          {p.name}
        </span>
        <span className="block text-[11px] leading-tight text-on-surface-variant">{p.role}</span>
      </span>
    </button>
  );

  return (
    <>
      {crew.length ? (
        <div className="mb-6">
          <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
            Written &amp; Directed
          </h3>
          <div className="flex flex-wrap gap-2.5">{crew.map(chip)}</div>
        </div>
      ) : null}

      {cast.length ? (
        <div className="mb-8">
          <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
            Cast
          </h3>
          <div className="flex flex-wrap gap-2.5">{cast.map(chip)}</div>
        </div>
      ) : null}
    </>
  );
}

function ActionButtons({
  item,
  inLibrary,
  pending,
  onPlay,
  onAdd,
}: {
  item: MediaItem;
  inLibrary: boolean;
  pending: boolean;
  onPlay: () => void;
  onAdd: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onPlay}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-label-md text-label-md text-on-primary shadow-[0_4px_20px_rgba(78,222,163,0.3)] transition-colors hover:bg-primary-fixed"
      >
        <Icon name="play_arrow" fill />
        Watch Trailer
      </button>

      {inLibrary ? (
        <div className="flex w-full cursor-default items-center justify-center gap-2 rounded-full border border-primary/30 bg-surface-variant/50 py-3 font-label-md text-label-md text-primary">
          <Icon name="check" />
          In Library
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={pending || !item.imdbId}
          title={item.imdbId ? undefined : "Stremio needs an IMDb ID for this title"}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-surface-variant py-3 font-label-md text-label-md text-white transition-colors hover:bg-surface-variant/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name={pending ? "progress_activity" : "add"} className={pending ? "animate-spin" : ""} />
          {pending ? "Adding…" : "Add to Library"}
        </button>
      )}
    </>
  );
}
