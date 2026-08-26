"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { GemPayload } from "@/app/api/gem/route";
import { useFetch } from "@/lib/useFetch";
import { useWatchlist } from "@/lib/useWatchlist";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "./Icon";
import { PosterImage } from "./PosterImage";

/**
 * One recommendation, for one week.
 *
 * Everything else on Discover is a rail: twenty titles wide, refreshed on a
 * timer, browsed rather than read. This is the opposite of that on purpose —
 * a single well-regarded, little-seen title that does not move for seven days,
 * in a strip about the height of two lines of text. Its restraint is the
 * feature. A "pick of the week" that took a hero slot would be a promotion,
 * and nobody trusts a promotion.
 *
 * What it is allowed to spend space on instead is time: the hairline along the
 * bottom is how far through the week the pick is, and the label says when the
 * next one lands. That is what makes it read as a standing recommendation
 * rather than another row of posters.
 *
 * Which title it is comes from `/api/gem` — see there for how the pick is kept
 * still for the week even though the pool behind it is rebuilt hourly.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** How often the countdown and the hairline are recomputed. */
const TICK = 60_000;

/**
 * The countdown, split into its caption and its figure so the two can be set
 * at different sizes without the string being parsed back apart.
 *
 * `ms` can be negative or `NaN`: the response is CDN-cached for an hour, so on
 * a Monday morning a reader can be handed a `nextAt` that has just passed, and
 * on the very first render `nextAt` has not arrived at all. Both are a pick
 * about to be replaced rather than an error, and both are worth saying plainly
 * instead of rendering "in -4m".
 */
function remainingLabel(ms: number): string {
  return Number.isFinite(ms) && ms > 0 ? "New pick in" : "This week's pick";
}

function remainingValue(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "ends today";

  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / 60_000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function GemOfTheWeek() {
  const { data } = useFetch<GemPayload>("/api/gem");
  const openDetails = useAppStore((s) => s.openDetails);
  const item = data?.item ?? null;
  const inLibrary = useAppStore((s) =>
    item?.imdbId ? s.libraryIds.has(item.imdbId) : false,
  );
  const watchlist = useWatchlist();

  const nextAt = data?.nextAt ? Date.parse(data.nextAt) : NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(nextAt)) return;
    const id = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(id);
  }, [nextAt]);

  /*
     The hairline starts at zero and is moved to its real width one frame
     later, so the bar draws itself in on arrival rather than appearing already
     filled. The transition lives on the CSS class; this only supplies the
     target. `data` in the dependency list is what restarts it when the payload
     lands, since the first render has nothing to draw.
  */
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!item) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [item]);

  /*
     Nothing at all rather than an empty state, exactly as `BecauseYouWatched`
     decides it. This sits between the hero and the rails; a box explaining
     that TMDB could not be reached this hour is worse than the gap it fills.
  */
  if (!item) return null;

  const remaining = Number.isFinite(nextAt) ? nextAt - now : NaN;
  // Elapsed against the seven days ending at `nextAt` — the same span the
  // route hands out, so the bar and the countdown can never disagree.
  const progress = Number.isFinite(remaining)
    ? Math.min(100, Math.max(0, ((WEEK - remaining) / WEEK) * 100))
    : 0;

  const saved = watchlist.has(item.imdbId);
  const meta = [item.year, item.kind === "series" ? "Series" : "Film", item.runtime]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-label="Gem of the week"
      className="mb-10"
    >
      <div className="gem-card panel-glow group relative flex items-center gap-4 overflow-hidden rounded-[20px] p-3 sm:gap-5 sm:p-4">
        <div className="relative h-[66px] w-[44px] shrink-0 overflow-hidden rounded-[8px] border border-white/10 bg-surface-container shadow-[0_8px_20px_rgba(0,0,0,0.55)] sm:h-[78px] sm:w-[52px]">
          <PosterImage
            src={item.poster}
            variants={item.posters}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>

        <div className="min-w-0 flex-1">
          <span className="gem-label block font-label-md text-[10px] font-semibold uppercase tracking-[0.16em]">
            Gem of the week
          </span>

          {/*
             The details control, stretched over the whole card by its own
             pseudo-element. One button in the tab order for "open this", one
             for the watchlist, and every pixel between them clickable —
             which a nested pair of real buttons could not have given.
          */}
          <button
            type="button"
            onClick={() => openDetails(item)}
            className="mt-0.5 block max-w-full truncate text-left font-title-lg text-[17px] leading-tight text-on-surface transition-colors after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:text-primary focus-visible:outline-none sm:text-[19px]"
          >
            {item.title}
          </button>

          {/*
             Two lines in one line's worth of space.

             At rest this says why the title was picked — the rating and the
             vote count the route actually selected on. On hover or keyboard
             focus it cross-fades to the synopsis, so the card can answer "what
             is it" without being any taller. Touch never hovers and simply
             keeps the first line, which is the one that earns the space.
          */}
          <span className="relative mt-1 block h-[16px] overflow-hidden">
            <span className="absolute inset-0 truncate font-body-md text-[12px] leading-4 text-on-surface/55 transition-opacity duration-300 group-hover:opacity-0 group-focus-within:opacity-0">
              {data?.why}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 truncate font-body-md text-[12px] leading-4 text-on-surface/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {item.description}
            </span>
          </span>

          <span className="mt-1 block truncate font-label-md text-[11px] text-on-surface/35">
            {meta}
            {inLibrary ? " · In your library" : ""}
          </span>
        </div>

        {/*
           The right-hand third, which is otherwise a very long stretch of
           nothing on a desktop: how long this pick has left, then the one
           control the card offers.

           The countdown lives here rather than beside the label because it is
           the half of "of the week" that a reader is allowed to ignore, and
           because the card is full-bleed — a heading hard against the left
           edge with nine hundred empty pixels after it reads as unfinished.
           Below `sm` it is the first thing to go: the strip is then barely
           wider than the title.
        */}
        <div className="hidden shrink-0 flex-col items-end gap-0.5 border-r border-white/8 pr-4 text-right sm:flex">
          <span className="font-label-md text-[9px] uppercase tracking-[0.18em] text-on-surface/30">
            {remainingLabel(remaining)}
          </span>
          <span className="font-title-lg text-[15px] leading-none text-on-surface/70 tabular-nums">
            {remainingValue(remaining)}
          </span>
        </div>

        {/*
           A recommendation you cannot act on is a poster. The one control
           here is the one a recommendation asks for — keep it for later —
           and it sits above the stretched details button rather than inside
           it, so pressing it does not also open the modal.
        */}
        <button
          type="button"
          onClick={() => void watchlist.toggle(item)}
          disabled={watchlist.pending}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.title} from your watchlist` : `Add ${item.title} to your watchlist`}
          className={`relative z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 ${
            saved
              ? "border-primary/40 bg-primary/20 text-primary"
              : "border-white/12 bg-white/5 text-on-surface/60 hover:border-primary/35 hover:text-primary"
          }`}
        >
          <Icon name="bookmark" fill={saved} style={{ fontSize: "18px" }} />
        </button>

        {/*
           Hidden on a phone by a wrapper rather than by a class on the glyph
           itself. Google's Material Symbols stylesheet declares
           `display: inline-block` on `.material-symbols-outlined` unlayered,
           and an unlayered rule beats anything in `@layer utilities` whatever
           the specificity — so `hidden` on an `<Icon>` is inert, and this
           arrow rendered on a 390px screen where it had been told not to.
        */}
        <span className="hidden shrink-0 sm:block">
          <Icon
            name="chevron_right"
            style={{ fontSize: "20px" }}
            className="text-on-surface/25 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary/70"
          />
        </span>

        {/*
           How much of the week this pick has left. Informative rather than
           decorative — it is the only thing on the card that says "of the
           week" without spending a word on it.
        */}
        <span
          className="gem-week"
          role="presentation"
          style={{ "--gem-progress": `${drawn ? progress : 0}%` } as React.CSSProperties}
        />
      </div>
    </motion.section>
  );
}
