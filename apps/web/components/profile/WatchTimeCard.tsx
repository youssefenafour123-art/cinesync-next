"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useWatchTime } from "@/lib/useWatchTime";
import { CountUp } from "@/components/ui/CountUp";
import { Icon } from "@/components/ui/Icon";

/**
 * How long the account has spent watching, and how many episodes that was.
 *
 * Two sources, added together and kept distinguishable — see `useWatchTime`,
 * which does the arithmetic:
 *
 *   - a connected Stremio account's `overallTimeWatched`, a real counter kept
 *     by the player and summed across every row it has;
 *   - the app's own Watched list, priced at each title's published length —
 *     a film's runtime, a series' whole run.
 *
 * The second half is why this card exists at all in an account with no
 * Stremio connected: ticking a series here used to move the "Watched" tally
 * and leave the headline figure untouched, which read as broken because it
 * was. It is an estimate, and the footnote under the figure says which part
 * of the total it is rather than letting the two blur together.
 *
 * `overallTimeWatched` rather than `timeWatched` on the Stremio side: the
 * second is only the current video's tally and came to a tenth of the real
 * figure.
 *
 * There is no "Live" badge. It claimed the number refreshed as you watched,
 * which was only ever true of the Stremio half and only on a focus event;
 * on the marked half it was plainly wrong, and a pulsing dot next to a figure
 * that has not moved in a week is decoration pretending to be telemetry.
 */

/** The ways the same duration can be said, in the order the card cycles them. */
const UNITS = ["calendar", "days", "hours", "minutes"] as const;
type Unit = (typeof UNITS)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A month here is 30 days. Nobody reading "1m 12d" wants a calendar argument. */
const MONTH = 30 * DAY;

interface Part {
  value: number;
  suffix: string;
}

function parts(ms: number, unit: Unit): Part[] {
  switch (unit) {
    case "calendar": {
      const months = Math.floor(ms / MONTH);
      const days = Math.floor((ms % MONTH) / DAY);
      const hours = Math.floor((ms % DAY) / HOUR);
      // Nothing gains from "0m 0d 7h" — the leading zeroes are dropped until
      // the first unit that has something to say.
      const all: Part[] = [
        { value: months, suffix: "m" },
        { value: days, suffix: "d" },
        { value: hours, suffix: "h" },
      ];
      const first = all.findIndex((p) => p.value > 0);
      return first === -1 ? [{ value: 0, suffix: "h" }] : all.slice(first);
    }
    case "days":
      return [{ value: Math.round(ms / DAY), suffix: "days" }];
    case "hours":
      return [{ value: Math.round(ms / HOUR), suffix: "hours" }];
    case "minutes":
      return [{ value: Math.round(ms / 60_000), suffix: "minutes" }];
  }
}

/** Whole hours, for the footnote that splits the total into its two sources. */
function hours(ms: number): string {
  return Math.round(ms / HOUR).toLocaleString();
}

export function WatchTimeCard() {
  const { ms, playedMs, markedMs, episodes, markedTitles } = useWatchTime();
  const [unit, setUnit] = useState<Unit>("calendar");

  const shown = useMemo(() => parts(ms, unit), [ms, unit]);

  /*
     Nothing at all when there is nothing to show.

     Neither a connected library nor a single title marked watched leaves this
     at zero, and a card announcing "0h — time spent" is the decoration the
     profile rebuild removed: it takes the best position on the screen to say
     nothing. It is no longer the same as "no Stremio account" — an account
     that has only ever ticked titles here now has a figure.
  */
  if (ms <= 0) return null;

  const cycle = () => setUnit((u) => UNITS[(UNITS.indexOf(u) + 1) % UNITS.length]);

  return (
    <motion.button
      type="button"
      onClick={cycle}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      aria-label={`Time spent watching, shown in ${unit === "calendar" ? "months, days and hours" : unit}. Press to change units.`}
      className="hero-stat panel-glow group w-full rounded-lg p-6 text-left"
    >
      <h3 className="font-title-lg text-[15px] text-on-surface/80">Time spent watching</h3>

      {/*
         Keyed on the unit, so React swaps the line and the new figure springs
         in. Deliberately *not* `AnimatePresence mode="wait"`, which was the
         first version: that holds the incoming child until the outgoing one's
         exit animation finishes, and an exit animation runs on rAF. Anything
         that stalls the frame loop — a backgrounded tab, most obviously —
         leaves the card showing the old units for ever while the state behind
         it has already changed. Caught pressing it four times with nothing
         happening.
      */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <motion.div
          key={unit}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="flex flex-wrap items-baseline gap-x-2"
        >
          {shown.map((part) => (
            <span key={part.suffix} className="flex items-baseline">
              <CountUp
                value={part.value}
                className="font-headline-lg text-[34px] leading-none text-on-surface"
              />
              <span className="ml-0.5 font-title-lg text-[17px] text-on-surface/70">
                {part.suffix}
              </span>
            </span>
          ))}
        </motion.div>
      </div>

      <p className="mt-1 flex items-center gap-1 font-label-md text-label-md text-on-surface/60">
        Time spent
        <Icon
          name="swap_horiz"
          className="text-[14px] opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
        />
      </p>

      {/*
         Where the number came from, but only when there is something to
         disambiguate.

         An account with one source needs no breakdown — a line reading "1,022h
         played" under a figure of 1,022 hours is noise. It appears the moment
         the two are mixed, because that is the moment the total stops being a
         single kind of fact, and it names the estimated half as estimated.
      */}
      {markedMs > 0 && playedMs > 0 ? (
        <p className="mt-2 font-label-md text-[11px] leading-relaxed text-on-surface/45">
          {hours(playedMs)}h played in Stremio · {hours(markedMs)}h estimated from{" "}
          {markedTitles === 1 ? "1 title" : `${markedTitles} titles`} you marked watched
        </p>
      ) : markedMs > 0 ? (
        <p className="mt-2 font-label-md text-[11px] leading-relaxed text-on-surface/45">
          Estimated from the full length of{" "}
          {markedTitles === 1 ? "the title" : `the ${markedTitles} titles`} you marked watched
        </p>
      ) : null}

      <div className="mt-5 border-t border-white/15 pt-4">
        <CountUp
          value={episodes}
          className="block font-headline-lg text-[26px] leading-none text-on-surface"
        />
        <span className="font-label-md text-label-md text-on-surface/60">
          {episodes === 1 ? "Episode finished" : "Episodes finished"}
        </span>
      </div>
    </motion.button>
  );
}
