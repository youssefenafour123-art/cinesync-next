"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { CountUp } from "@/components/ui/CountUp";
import { Icon } from "@/components/ui/Icon";

/**
 * How long the account has spent watching, and how many episodes that was.
 *
 * The profile has said since it was built that CineSync "has never tracked a
 * minute of playback", and leading with hours watched would have been the
 * invented-profile problem all over again. Connecting a Stremio account
 * changed that: `overallTimeWatched` is a real counter kept by the player,
 * summed here across every row it has — 1,022 hours on the account this was
 * built against. Nothing on this card is estimated, and it does not render at
 * all for someone with nothing behind it.
 *
 * `overallTimeWatched` rather than `timeWatched`: the second is only the
 * current video's tally and came to a tenth of the real figure.
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

export function WatchTimeCard() {
  const watchedMs = useAppStore((s) => s.watchedMs);
  const episodes = useAppStore((s) => s.episodesWatched);
  const [unit, setUnit] = useState<Unit>("calendar");

  const shown = useMemo(() => parts(watchedMs, unit), [watchedMs, unit]);

  /*
     Nothing at all when there is nothing to show.

     Without a connected Stremio account this is zero, and a card announcing
     "0h — time spent" is the decoration the profile rebuild removed: it takes
     the best position on the screen to say nothing.
  */
  if (watchedMs <= 0) return null;

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
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-title-lg text-[15px] text-on-surface/80">Time spent watching</h3>

        {/*
           The pulse is the "this is live" mark: the figure moves when the
           library is read again, which happens whenever this tab is returned
           to. It is CSS, so the app's reduced-motion reset stills it.
        */}
        <span className="flex items-center gap-1.5 font-label-md text-[11px] uppercase tracking-wider text-primary/80">
          <span className="live-dot" aria-hidden="true" />
          Live
        </span>
      </div>

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
