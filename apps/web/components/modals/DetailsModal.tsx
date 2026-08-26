"use client";

import { useEffect, useState } from "react";
import type { CreditedPerson, MediaItem, Scores } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { useLibraryActions } from "@/lib/useLibraryActions";
import { useWatchlist } from "@/lib/useWatchlist";
import { useWatched } from "@/lib/useWatched";
import { AddToList } from "@/components/ui/AddToList";
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
/**
 * Whether two credit lines name the same people.
 *
 * Compared as a set of squashed names, because the providers punctuate
 * differently and nothing else about them differs: TMDB writes "D. B. Weiss"
 * where IMDb writes "D.B. Weiss", and comparing the raw strings would call
 * that a second, different credit.
 */
function sameCredit(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const names = (v: string) =>
    new Set(
      v
        .split(",")
        .map((n) => n.replace(/[^a-z0-9]/gi, "").toLowerCase())
        .filter(Boolean),
    );
  const [x, y] = [names(a), names(b)];
  return x.size === y.size && [...x].every((n) => y.has(n));
}

export function DetailsModal({ item }: { item: MediaItem }) {
  const close = useAppStore((s) => s.closeDetails);
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));
  const { add, remove, adding, removing } = useLibraryActions();
  const watchlist = useWatchlist();
  const watched = useWatched();
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

  /*
     What it won, for the badge under the title.

     The same URL `ScoresPanel` asks for, character for character — `useFetch`
     dedupes by URL and shares the promise, so the panel further down this
     modal and this badge are one request, not two. Anything else here would
     have meant a second round trip to OMDb for a field the first one already
     returned.
  */
  const scoresUrl = full.imdbId
    ? `/api/scores/${full.imdbId}?kind=${full.kind}${full.tmdbId ? `&tmdb=${full.tmdbId}` : ""}`
    : null;
  const { data: scores } = useFetch<Scores>(scoresUrl);
  const awards = scores?.awards;

  /*
     Is this still to come?

     Compared on `releaseIso` rather than the formatted `releaseDate`, which is
     written for a reader and reads "TBA" when there is no date at all — a
     string that cannot be compared to anything. A title with no date is
     treated as upcoming too: nothing in these catalogues is undated *and*
     already out, so the honest answer there is "announced", not silence.
  */
  const today = new Date().toISOString().slice(0, 10);
  const unreleased = full.releaseIso ? full.releaseIso > today : !full.year;
  /*
     Print the day only when someone has actually announced it.

     `releaseConfirmed` is set from TMDB's announced-releases record, because
     TMDB dates every unreleased film whether or not a date exists — printing
     that raw would state a guess as fact. Unconfirmed falls back to the year,
     which is the part that is genuinely known.
  */
  const releaseLine = !full.releaseIso
    ? full.year
      ? `Expected ${full.year}`
      : "Not yet announced"
    : full.releaseConfirmed
      ? full.releaseDate
      : `Expected ${full.releaseIso.slice(0, 4)}`;

  /*
     A series credits its creators once, not twice.

     `created_by` on a show already means "the people who wrote it", so a
     writing credit naming exactly those people is the same sentence under a
     second heading — "Creator: Vince Gilligan" beside "Writer: Vince
     Gilligan". A show whose writing credit is *wider* than its creators (The
     Wire adds Ed Burns) still says so.

     A film keeps both lines either way: writing and directing are separate
     credits even when one person holds both, which is how IMDb prints them.

     This lives here rather than in `/api/enrich` because the merge above lets
     the list item override the fetched payload — dropping the field server-side
     would only see it reinstated by whatever rail the card came from.
  */
  const showWriter =
    Boolean(full.writer) && !(full.kind === "series" && sameCredit(full.director, full.writer));

  return (
    <ModalShell
      onClose={close}
      label={`Details for ${full.title}`}
      className="glass-panel panel-glow max-w-6xl rounded-xl md:flex-row"
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
        <PosterImage src={full.poster}
          variants={full.posters} alt={full.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent" />
      </div>

      {/* Desktop poster + actions */}
      <div className="hidden w-[340px] shrink-0 self-start p-8 md:block">
        <div className="aspect-[2/3] overflow-hidden rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
          <PosterImage src={full.poster}
          variants={full.posters} alt={full.title} className="h-full w-full object-cover" />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <ActionButtons
            item={full}
            inLibrary={inLibrary}
            adding={adding}
            removing={removing}
            onPlay={() => play(full)}
            onAdd={() => add(full)}
            watchlist={watchlist}
            watched={watched}
            onRemove={() => remove(full)}
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

        {/*
           What it won, in one pill.

           Under the title rather than in the credits row below, because it is
           the kind of thing that changes whether someone keeps reading — and
           it arrives after the title does, so a row that reflows would be
           worse than a line that appears.

           Two tones, and the difference matters more than it looks: gold only
           when OMDb named a body *and* the title actually won it. "Nominated
           for 7 Oscars" is The Shawshank Redemption, and dressing that in the
           winner's colour would be a lie about the most famous loss in the
           Academy's history. `parseAwards` keeps the two apart; this only has
           to not throw the distinction away again.
        */}
        {awards ? (
          <div className="mb-4 -mt-1 flex">
            <span
              title={awards.detail}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label-md text-[12px] tracking-normal ${
                awards.won && awards.headline
                  ? "border-[#f5c518]/35 bg-[#f5c518]/10 text-[#f5c518]"
                  : "border-white/12 bg-white/[0.04] text-on-surface-variant"
              }`}
            >
              <Icon
                name={awards.won && awards.headline ? "emoji_events" : "workspace_premium"}
                fill={awards.won && awards.headline}
                style={{ fontSize: "15px" }}
              />
              {awards.label}
            </span>
          </div>
        ) : null}

        <div className="mb-8 flex flex-wrap items-center gap-6 border-b border-white/10 pb-6">
          {full.director ? (
            <div>
              {/* "Creator" for a series, "Directors" for co-directed films. The
                  heading used to be hardcoded to "Director" over whatever name
                  happened to be there, which is how an executive producer ended
                  up credited with directing Breaking Bad. */}
              <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
                {full.directorLabel ?? "Director"}
              </span>
              <span className="font-body-md text-body-md text-on-surface">{full.director}</span>
            </div>
          ) : null}

          {unreleased ? (
            <div>
              <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
                {full.kind === "series" ? "First airs" : "Releases"}
              </span>
              <span className="font-body-md text-body-md text-on-surface">{releaseLine}</span>
            </div>
          ) : null}

          {showWriter ? (
            <div>
              {/* "Screenplay", "Teleplay", "Writer" or "Writers" — whichever
                  credit the title actually carries. Shown even when it names
                  the same person as the directing credit, because writing and
                  directing a film are two credits and IMDb prints both. */}
              <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
                {full.writerLabel ?? "Writer"}
              </span>
              <span className="font-body-md text-body-md text-on-surface">{full.writer}</span>
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

          {full.kind === "series" && full.episodeCount ? (
            <div>
              <span className="mb-1 block font-label-md text-label-md uppercase tracking-widest text-primary">
                Episodes
              </span>
              <span className="font-body-md text-body-md text-on-surface">
                {full.episodeCount}
                {full.seasonCount ? (
                  <span className="text-on-surface-variant">
                    {" "}
                    across {full.seasonCount} {full.seasonCount === 1 ? "season" : "seasons"}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
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
            adding={adding}
            removing={removing}
            onPlay={() => play(full)}
            onAdd={() => add(full)}
            watchlist={watchlist}
            watched={watched}
            onRemove={() => remove(full)}
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
  adding,
  removing,
  onPlay,
  onAdd,
  onRemove,
  watchlist,
  watched,
}: {
  item: MediaItem;
  inLibrary: boolean;
  adding: boolean;
  removing: boolean;
  onPlay: () => void;
  onAdd: () => void;
  onRemove: () => void;
  watchlist: ReturnType<typeof useWatchlist>;
  watched: ReturnType<typeof useWatched>;
}) {
  const saved = watchlist.has(item.imdbId);
  const seen = watched.has(item.imdbId);
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
        /*
           The added state is itself the remove control, rather than a second
           button sitting beside it — the same swap Stremio and Netflix use.
           `group` drives it: at rest it reads as a status chip in the primary
           colour, and only on hover or keyboard focus does it turn into a
           destructive action, so nothing about the resting state invites the
           click that removes a title.
        */
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          title={`Remove “${item.title}” from your Stremio library`}
          className="group flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-surface-variant/50 py-3 font-label-md text-label-md text-primary transition-colors hover:border-error/40 hover:bg-error/10 hover:text-error focus-visible:border-error/40 focus-visible:bg-error/10 focus-visible:text-error disabled:opacity-60"
        >
          {/*
             Every toggled piece is wrapped in a plain span.

             `hidden` could not be put on the Icon itself: globals.css declares
             `.material-symbols-outlined { display: inline-block }` unlayered,
             which outranks a Tailwind utility on the same element, so the
             delete glyph stayed visible and the resting pill showed a tick and
             a bin at once. The wrapper carries no such class, so `hidden`
             wins there.
          */}
          {removing ? (
            <>
              <Icon name="progress_activity" className="animate-spin text-[18px]" />
              <span>Removing…</span>
            </>
          ) : (
            <>
              <span className="flex items-center group-hover:hidden group-focus-visible:hidden">
                <Icon name="check" className="text-[18px]" />
              </span>
              <span className="hidden items-center group-hover:flex group-focus-visible:flex">
                <Icon name="delete" className="text-[18px]" />
              </span>
              <span className="group-hover:hidden group-focus-visible:hidden">In Library</span>
              <span className="hidden group-hover:inline group-focus-visible:inline">Remove</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || !item.imdbId}
          title={item.imdbId ? undefined : "Stremio needs an IMDb ID for this title"}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-surface-variant py-3 font-label-md text-label-md text-white transition-colors hover:bg-surface-variant/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name={adding ? "progress_activity" : "add"} className={adding ? "animate-spin" : ""} />
          {adding ? "Adding…" : "Add to Library"}
        </button>
      )}

      {/*
         Hidden entirely when signed out rather than shown disabled. "Add to
         Library" is disabled without an IMDb id because the title is the
         problem and saying so helps; a watchlist button that needs an account
         is a different thing, and an inert control on a page most visitors use
         signed out is the kind of decoration this app already had too much of.
      */}
      {watchlist.signedIn ? (
        <button
          type="button"
          onClick={() => watchlist.toggle(item)}
          disabled={watchlist.pending || !item.imdbId}
          title={item.imdbId ? undefined : "This title has no IMDb ID yet"}
          aria-pressed={saved}
          className={`flex w-full items-center justify-center gap-2 rounded-full border py-3 font-label-md text-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            saved
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-white/10 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
          }`}
        >
          <Icon name={saved ? "bookmark_added" : "bookmark_add"} fill={saved} className="text-[18px]" />
          {saved ? "On your watchlist" : "Add to watchlist"}
        </button>
      ) : null}

      {/*
         Watched, beside the watchlist and not instead of it.

         Marking something seen deliberately leaves it on the watchlist. The
         two answer different questions — what I mean to see, what I have seen
         — and a title can be both: something watched years ago and queued for
         a rewatch. Moving it automatically would be this app deciding that
         nobody rewatches anything.
      */}
      {watched.signedIn ? (
        <button
          type="button"
          onClick={() => watched.toggle(item)}
          disabled={watched.pending || !item.imdbId}
          title={item.imdbId ? undefined : "This title has no IMDb ID yet"}
          aria-pressed={seen}
          className={`flex w-full items-center justify-center gap-2 rounded-full border py-3 font-label-md text-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            seen
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-white/10 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
          }`}
        >
          <Icon name={seen ? "visibility" : "visibility_off"} fill={seen} className="text-[18px]" />
          {seen ? "Watched" : "Mark as watched"}
        </button>
      ) : null}

      {/*
         Below the watchlist button, not beside it. The watchlist is one list
         with one answer, so it stays a single press; everything else is a
         choice among lists, and a choice belongs behind a disclosure rather
         than in the row of primary actions.
      */}
      {/*
         Keyed by the title so opening a different one starts this over. The
         panel caches which lists hold *this* film; carrying that across a
         change of title would tick lists that hold the previous one.
      */}
      <AddToList key={item.imdbId ?? item.key} item={item} />
    </>
  );
}
