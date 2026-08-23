"use client";

import { motion } from "framer-motion";
import type { CalendarEntry } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "./ModalShell";

/**
 * One day of the release calendar, at full size.
 *
 * The grid cell it opens from is 116px tall and holds three cropped poster
 * thumbnails — enough to say "something lands here", not enough to say what.
 * The panel under the grid was the first answer to that and it is still there,
 * but it shares the page with the month and so stays compact: a two-line
 * synopsis, episode names truncated to one line.
 *
 * This is the room-to-breathe version. Backdrop art per release, the whole
 * synopsis, every episode with its own summary, and arrows to walk to the next
 * day without going back to the grid first.
 */
export function DayModal({
  date,
  entries,
  onClose,
  onNavigate,
  canGoBack,
  canGoForward,
}: {
  date: string;
  entries: CalendarEntry[];
  onClose: () => void;
  /** Step one day within the month. */
  onNavigate: (delta: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
}) {
  const reduced = useReducedMotion();

  const day = new Date(`${date}T00:00:00Z`);
  const label = day.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  /*
     A narrower heading for narrow screens. The full form wraps to two lines on
     a 390px phone — and wraps *around the close button*, which is the corner it
     runs into. The year is what goes: the month grid behind already names it.
  */
  const shortLabel = day.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const films = entries.filter((e) => e.kind === "movie").length;
  const shows = entries.filter((e) => e.kind === "series");
  const episodeCount = shows.reduce((n, e) => n + (e.episodes?.length ?? 0), 0);

  // "2 films · 6 episodes across 3 shows" — the counts people actually scan
  // for, rather than a single "8 releases" that hides the shape of the day.
  const summary = [
    films ? `${films} ${films === 1 ? "film" : "films"}` : null,
    episodeCount
      ? `${episodeCount} ${episodeCount === 1 ? "episode" : "episodes"} across ${shows.length} ${
          shows.length === 1 ? "show" : "shows"
        }`
      : null,
  ].filter(Boolean);

  return (
    <ModalShell
      onClose={onClose}
      label={`Releases on ${label}`}
      className="glass-panel max-w-5xl rounded-2xl"
    >
      <header className="shrink-0 border-b border-white/10 px-6 py-5 pr-16 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-label-md text-label-md uppercase tracking-widest text-primary">
            Releasing
          </span>
          {/* Day steppers sit with the date rather than in the corner: they
              move the thing the heading names. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onNavigate(-1)}
              disabled={!canGoBack}
              aria-label="Previous day"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Icon name="chevron_left" className="text-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate(1)}
              disabled={!canGoForward}
              aria-label="Next day"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
        </div>

        <h2 className="mt-1 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </h2>

        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          {summary.length ? summary.join(" · ") : "Nothing scheduled."}
        </p>
      </header>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-6 md:px-8">
        {entries.length ? (
          <motion.div
            className="flex flex-col gap-4"
            variants={{ hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.06 } } }}
            initial="hidden"
            animate="show"
          >
            {entries.map((entry) => (
              <DayEntry key={entry.key} entry={entry} reduced={reduced} />
            ))}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon name="event_busy" className="text-[40px] text-on-surface-variant/40" />
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Nothing releases on this day.
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant/70">
              Use the arrows above to check the days either side.
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/** One release, with the art and the full text the grid cell has no room for. */
function DayEntry({ entry, reduced }: { entry: CalendarEntry; reduced: boolean }) {
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => (entry.imdbId ? s.libraryIds.has(entry.imdbId) : false));

  const open = () =>
    // Calendar entries carry no IMDb id for films — the details modal resolves
    // the rest from the TMDB id it is handed. Opening from here stacks the
    // details over this modal, so closing it returns to the day.
    openDetails({
      key: `tmdb:${entry.tmdbId}`,
      tmdbId: entry.tmdbId,
      imdbId: entry.imdbId,
      title: entry.title,
      kind: entry.kind,
      poster: entry.poster,
      backdrop: entry.backdrop,
      rating: entry.rating,
      description: entry.overview,
    });

  return (
    <motion.article
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-xl border border-white/10 bg-surface-container/50"
    >
      {/* Backdrop wash, faint enough to read text over at any brightness. */}
      {entry.backdrop ? (
        <div className="pointer-events-none absolute inset-0 -z-0 opacity-[0.18]">
          <PosterImage src={entry.backdrop} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#121212] via-[#121212]/85 to-[#121212]/40" />
        </div>
      ) : null}

      <div className="relative z-10 flex gap-4 p-4 md:gap-5 md:p-5">
        <button
          type="button"
          onClick={open}
          aria-label={`Details for ${entry.title}`}
          className="h-[150px] w-[100px] shrink-0 overflow-hidden rounded-lg border border-white/10 transition-transform hover:scale-[1.03] md:h-[186px] md:w-[124px]"
        >
          <PosterImage src={entry.poster} alt={entry.title} className="h-full w-full object-cover" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                entry.kind === "series"
                  ? "border border-secondary/40 bg-secondary-container/20 text-secondary"
                  : "border border-primary/40 bg-primary/10 text-primary"
              }`}
            >
              {entry.kind === "series"
                ? `${entry.episodes?.length ?? 0} new ${
                    (entry.episodes?.length ?? 0) === 1 ? "episode" : "episodes"
                  }`
                : "Film"}
            </span>
            {entry.rating ? (
              <span className="flex items-center gap-1 text-[12px] text-on-surface-variant">
                <Icon name="star" className="text-[14px] text-[#f5c518]" fill />
                {entry.rating}
              </span>
            ) : null}
            {inLibrary ? (
              <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                In Library
              </span>
            ) : null}
          </div>

          <h3 className="mt-1.5 font-title-lg text-[20px] leading-tight text-white md:text-[22px]">
            {entry.title}
          </h3>

          {entry.overview ? (
            <p className="mt-2 font-body-md text-[14px] leading-relaxed text-on-surface-variant">
              {entry.overview}
            </p>
          ) : null}

          {entry.episodes?.length ? (
            <ul className="mt-4 flex flex-col gap-2.5 border-t border-white/10 pt-3">
              {entry.episodes.map((ep) => (
                <li key={ep.code}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-primary">
                      {ep.code}
                    </span>
                    {/* No truncation here — the whole point of the bigger view
                        is that the episode title fits. */}
                    <span className="font-title-lg text-[15px] text-on-surface">{ep.name}</span>
                    {ep.isPremiere ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-secondary">
                        Premiere
                      </span>
                    ) : ep.isFinale ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-tertiary">
                        Finale
                      </span>
                    ) : null}
                  </div>
                  {ep.overview ? (
                    <p className="mt-0.5 font-body-md text-[13px] leading-relaxed text-on-surface-variant/85">
                      {ep.overview}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={open}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-variant/60 px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Icon name="info" className="text-[18px]" />
            Full details
          </button>
        </div>
      </div>
    </motion.article>
  );
}
