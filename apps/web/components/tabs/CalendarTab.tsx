"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { CalendarPayload } from "@/app/api/calendar/route";
import type { CalendarEntry } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/States";
import { DayModal } from "@/components/modals/DayModal";

type Filter = "all" | "movie" | "series";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** `YYYY-MM` for today, and for a month `delta` months away from one. */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today as `YYYY-MM-DD` in the viewer's own timezone, not UTC. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The cells of a month grid, Monday-first, padded so the first row starts on
 * the right weekday. Padding days are `null` rather than dates from the
 * neighbouring months — this grid only ever holds one month's data, and showing
 * a real date it has no entries for would read as "nothing releases that day".
 */
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay() is Sunday-0; shift so Monday is 0.
  const lead = (first.getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  // Trailing pad to a whole number of rows, so the grid doesn't end ragged.
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Release calendar.
 *
 * The Upcoming tab answers "what's coming soon" as two rails. This answers
 * "what lands on the 14th", which is a different question and needs a grid: a
 * month at a time, every day showing what arrives, and — the part rails cannot
 * express — which *episodes* of a series drop on which date, by season and
 * episode number.
 *
 * A day is selected rather than expanded in place. Thirty cells that each grow
 * to fit their contents is not a calendar you can scan, so the grid stays
 * uniform and the detail lives in a panel below it.
 *
 * That panel shares the page with the month, so it stays compact — clamped
 * synopses, one-line episode titles. Clicking a day therefore does two things:
 * it selects the day *and* opens `DayModal`, which is the same information with
 * room to actually read it. Every real date is clickable, empty ones included;
 * "nothing releases that day" is an answer worth being able to ask for.
 */
export function CalendarTab() {
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState<string | null>(null);
  /** The day blown up into the modal; null when it's closed. */
  const [openDay, setOpenDay] = useState<string | null>(null);
  /*
     The modal is portalled to <body>, so it can only be rendered once there is
     a document to portal into — false on the server, true from hydration on.

     `useSyncExternalStore` with a subscription that never fires is React's own
     way to ask "am I on the client"; the `useState` + `useEffect` version of
     this does the same thing one wasted render later.

     It has to be mounted while closed, rather than only while `openDay` is
     set, or `AnimatePresence` would be torn down along with its child and the
     modal would vanish instead of fading out.
  */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [filter, setFilter] = useState<Filter>("all");
  // +1 when moving forward, -1 back: the month slides the way you sent it.
  const [direction, setDirection] = useState(1);
  const reduced = useReducedMotion();

  const { data, loading, error, reload } = useFetch<CalendarPayload>(
    `/api/calendar?month=${month}`,
  );

  const today = todayIso();

  const entries = useMemo(() => {
    const all = data?.month === month ? data.entries : [];
    return filter === "all" ? all : all.filter((e) => e.kind === filter);
  }, [data, month, filter]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [entries]);

  const cells = useMemo(() => monthGrid(month), [month]);

  /*
     The day actually shown, derived rather than stored.

     `selected` holds only what the user clicked, and it wins for any day in
     the month on display — including one with nothing on it, now that empty
     days are clickable. Only a selection left behind by a month change is
     discarded, and then the fallback is computed at render: today if this
     month contains it, otherwise the first day that has something. Syncing
     this into state from an effect meant a cascading render and one frame
     showing the stale day.
  */
  const effectiveDay = useMemo(() => {
    if (selected?.startsWith(`${month}-`)) return selected;
    if (byDate.has(today)) return today;
    return [...byDate.keys()].sort()[0] ?? null;
  }, [selected, byDate, today, month]);

  const go = (delta: number) => {
    setDirection(delta);
    setMonth((m) => shiftMonth(m, delta));
    // A day from the outgoing month has nothing to say about the incoming one.
    setOpenDay(null);
  };

  /** Last day of the month on display, as `YYYY-MM-DD`. */
  const lastDay = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${month}-${String(days).padStart(2, "0")}`;
  }, [month]);

  const openDayEntries = openDay ? (byDate.get(openDay) ?? []) : [];

  /*
     Walk the modal a day at a time.

     Deliberately bounded to the month on display: the grid behind holds one
     month's data and nothing else, so stepping off the end would open a day
     the fetched payload knows nothing about and report it as empty.
  */
  const stepDay = (delta: number) => {
    if (!openDay) return;
    const d = new Date(`${openDay}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (!next.startsWith(`${month}-`)) return;
    setOpenDay(next);
    setSelected(next);
  };

  const selectDay = (date: string) => {
    setSelected(date);
    setOpenDay(date);
  };

  const selectedEntries = effectiveDay ? (byDate.get(effectiveDay) ?? []) : [];

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Release Calendar
          </h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Every premiere and episode drop, by the day it lands. Click a day to
            open it in full.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-white/10 bg-surface-container/60 p-1">
            {(["all", "movie", "series"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-4 py-1.5 font-label-md text-label-md transition-colors ${
                  filter === f
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {f === "all" ? "All" : f === "movie" ? "Films" : "Series"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous month"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-container/60 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Icon name="chevron_left" className="text-[20px]" />
            </button>
            <span className="min-w-[150px] text-center font-title-lg text-title-lg text-on-surface">
              {monthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next month"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-container/60 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Icon name="chevron_right" className="text-[20px]" />
            </button>
            {month !== thisMonth() ? (
              <button
                type="button"
                onClick={() => {
                  setDirection(month < thisMonth() ? 1 : -1);
                  setMonth(thisMonth());
                }}
                className="rounded-full border border-primary/30 px-3 py-1.5 font-label-md text-label-md text-primary transition-colors hover:bg-primary/10"
              >
                Today
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          {/* Weekday header sits outside the animated grid so the columns don't
              slide out from under their own labels. */}
          <div className="mb-2 grid grid-cols-7 gap-1.5 md:gap-2">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-1 text-center font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant/70"
              >
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d[0]}</span>
              </div>
            ))}
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={month}
                custom={direction}
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: direction * 60 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: direction * -60 }}
                transition={{ duration: reduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                className={`grid grid-cols-7 gap-1.5 md:gap-2 ${
                  loading && !data ? "animate-pulse" : ""
                }`}
              >
                {cells.map((date, i) => (
                  <DayCell
                    key={date ?? `pad-${i}`}
                    date={date}
                    index={i}
                    entries={date ? (byDate.get(date) ?? []) : []}
                    isToday={date === today}
                    isSelected={date !== null && date === effectiveDay}
                    onSelect={() => date && selectDay(date)}
                    reduced={reduced}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <DayPanel date={effectiveDay} entries={selectedEntries} loading={loading && !data} />

          {/*
             Portalled to <body>, unlike every other modal in the app, which is
             declared at the top level of `page.tsx` and needs no help.

             This one is rendered from inside a tab, and the tab shell is
             `<main className="relative z-10">` — a stacking context. A z-index
             handed out inside it is only ever compared against its siblings, so
             the modal's z-211 lost to the top nav (z-50) and the mobile tab bar
             (z-100), which sit outside `main`: the navs painted over the panel
             and the backdrop failed to dim them. Leaving the subtree fixes it
             without moving the calendar's state into the global store.
          */}
          {mounted
            ? createPortal(
                <AnimatePresence>
                  {openDay ? (
                    <DayModal
                      key={openDay}
                      date={openDay}
                      entries={openDayEntries}
                      onClose={() => setOpenDay(null)}
                      onNavigate={stepDay}
                      canGoBack={openDay > `${month}-01`}
                      canGoForward={openDay < lastDay}
                    />
                  ) : null}
                </AnimatePresence>,
                document.body,
              )
            : null}
        </>
      )}
    </div>
  );
}

function DayCell({
  date,
  index,
  entries,
  isToday,
  isSelected,
  onSelect,
  reduced,
}: {
  date: string | null;
  index: number;
  entries: CalendarEntry[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
  reduced: boolean;
}) {
  if (!date) return <div aria-hidden className="h-[68px] md:h-[116px]" />;

  const day = Number(date.slice(-2));
  const busy = entries.length > 0;
  const episodeCount = entries.reduce((n, e) => n + (e.episodes?.length ?? 0), 0);

  return (
    <motion.button
      type="button"
      // Cells wash in across the grid rather than all at once. The delay is
      // capped so the last cell of a 42-cell month isn't a second late.
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : Math.min(index * 0.008, 0.3) }}
      whileHover={reduced ? undefined : { y: -3 }}
      onClick={onSelect}
      /*
         Empty days stay clickable.

         They used to be `disabled`, which made "is anything out on the 3rd?"
         a question the calendar answered only by the absence of thumbnails in
         a cell you couldn't press. Opening an empty day and being told so is
         a better answer, and it means every cell behaves the same way.
      */
      aria-label={`${date}${busy ? `, ${entries.length} releases` : ", nothing scheduled"}`}
      aria-current={isToday ? "date" : undefined}
      /*
         A fixed height, not a minimum.

         With `min-h` the row grew to whatever the poster thumbnails wanted to
         be — an `<img>` in a `flex-1` box with no definite height resolves to
         its natural size, so every row came out nearly 300px tall and the month
         stopped being scannable. Fixing the cell height and letting the strip
         below shrink into it (`min-h-0`, because flex items refuse to go below
         their content otherwise) is what keeps all six rows uniform.
      */
      className={`relative flex h-[68px] flex-col overflow-hidden rounded-xl border p-1.5 text-left transition-colors md:h-[116px] md:p-2 ${
        isSelected
          ? "border-primary/70 bg-primary/10"
          : busy
            ? "border-white/10 bg-surface-container/50 hover:border-primary/40"
            : "border-white/5 bg-surface-container/20 hover:border-white/20"
      } cursor-pointer`}
    >
      <div className="relative z-10 flex items-center justify-between gap-1">
        <span
          className={`font-label-md text-[12px] ${
            isToday
              ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary font-bold text-on-primary"
              : busy
                ? // A dark chip behind the number: the strip underneath is
                  // poster art, and a bare numeral on it is unreadable half the
                  // time depending on which film landed that day.
                  "rounded bg-black/60 px-1 text-on-surface"
                : "text-on-surface-variant/40"
          }`}
        >
          {day}
        </span>
        {episodeCount > 0 ? (
          <span className="hidden rounded-full bg-secondary-container/30 px-1.5 text-[10px] font-bold text-secondary md:inline">
            {episodeCount} ep
          </span>
        ) : null}
      </div>

      {/* Desktop shows the art; a 50px mobile cell gets dots instead. */}
      <div className="mt-1 hidden min-h-0 flex-1 items-stretch gap-1 md:flex">
        {entries.slice(0, 3).map((e) => (
          <div
            key={e.key}
            className="relative min-w-0 flex-1 overflow-hidden rounded-md border border-white/10"
          >
            <PosterImage src={e.poster}
              variants={e.posters} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
        {entries.length > 3 ? (
          <span className="self-end text-[10px] font-bold text-on-surface-variant">
            +{entries.length - 3}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex gap-0.5 md:hidden">
        {entries.slice(0, 4).map((e) => (
          <span
            key={e.key}
            className={`h-1 w-1 rounded-full ${
              e.kind === "series" ? "bg-secondary" : "bg-primary"
            }`}
          />
        ))}
      </div>
    </motion.button>
  );
}

function DayPanel({
  date,
  entries,
  loading,
}: {
  date: string | null;
  entries: CalendarEntry[];
  loading: boolean;
}) {
  const label = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : null;

  return (
    <div className="mt-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={date ?? "none"}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {loading ? (
            <p className="pulsing-text py-10 text-center font-label-md text-label-md text-on-surface-variant">
              Loading the month…
            </p>
          ) : !date ? (
            <p className="py-10 text-center font-body-md text-body-md text-on-surface-variant">
              Nothing scheduled this month for the current filter.
            </p>
          ) : !entries.length ? (
            <>
              <h2 className="mb-4 border-b border-white/10 pb-3 font-headline-lg text-headline-lg-mobile text-on-surface">
                {label}
              </h2>
              <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
                Nothing releases on this day.
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-4 flex items-baseline gap-3 border-b border-white/10 pb-3 font-headline-lg text-headline-lg-mobile text-on-surface">
                {label}
                <span className="font-body-md text-[13px] font-normal text-on-surface-variant">
                  {entries.length} {entries.length === 1 ? "release" : "releases"}
                </span>
              </h2>

              <motion.div
                className="grid gap-3 lg:grid-cols-2"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                initial="hidden"
                animate="show"
              >
                {entries.map((entry) => (
                  <EntryRow key={entry.key} entry={entry} />
                ))}
              </motion.div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function EntryRow({ entry }: { entry: CalendarEntry }) {
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => (entry.imdbId ? s.libraryIds.has(entry.imdbId) : false));

  return (
    <motion.button
      type="button"
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      onClick={() =>
        // Calendar entries carry no IMDb id for films — the details modal
        // resolves the rest from the TMDB id it is handed.
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
        })
      }
      className="poster-glow flex gap-4 rounded-xl border border-white/10 bg-surface-container/50 p-3 text-left transition-colors hover:border-primary/40"
    >
      <div className="h-[108px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-white/10">
        <PosterImage src={entry.poster}
          variants={entry.posters} alt={entry.title} className="h-full w-full object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              entry.kind === "series"
                ? "border border-secondary/40 bg-secondary-container/20 text-secondary"
                : "border border-primary/40 bg-primary/10 text-primary"
            }`}
          >
            {entry.kind === "series" ? "Episode drop" : "Film"}
          </span>
          {entry.rating ? (
            <span className="text-[12px] text-on-surface-variant">★ {entry.rating}</span>
          ) : null}
          {inLibrary ? (
            <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              In Library
            </span>
          ) : null}
        </div>

        <h3 className="mt-1 truncate font-title-lg text-[16px] text-white">{entry.title}</h3>

        {entry.episodes?.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {entry.episodes.map((ep) => (
              <li key={ep.code} className="flex items-baseline gap-2 text-[13px]">
                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-primary">
                  {ep.code}
                </span>
                <span className="truncate text-on-surface/85">{ep.name}</span>
                {ep.isPremiere ? (
                  <span className="shrink-0 text-[10px] font-bold uppercase text-secondary">
                    Premiere
                  </span>
                ) : ep.isFinale ? (
                  <span className="shrink-0 text-[10px] font-bold uppercase text-tertiary">
                    Finale
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 line-clamp-2 font-body-md text-[13px] text-on-surface-variant">
            {entry.overview || "No synopsis yet."}
          </p>
        )}
      </div>
    </motion.button>
  );
}
