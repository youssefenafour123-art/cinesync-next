"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { AwardsPayload } from "@/app/api/awards/route";
import { useFetch } from "@/lib/useFetch";
import { Icon } from "./Icon";

/**
 * What something won, as a pill that opens into the itemised list.
 *
 * One component for both badges, which are otherwise the same pill written
 * twice. What differs between a title and a person is only what is passed in:
 *
 *   - a title's `won` can be false, because OMDb's line has to be parsed to
 *     work out whether a win is even being described, and "Nominated for 7
 *     Oscars" must not wear the winner's gold;
 *   - a title carries `summary`, OMDb's own sentence, because the totals it
 *     reports and the list Wikidata itemises come from different records and
 *     the panel says so rather than letting them look like one number.
 *
 * A person needs neither: their badge is counted from the same statements the
 * list is built from, so the two always agree.
 *
 * The list is fetched on first open, never before. `/api/awards` is three
 * Wikidata calls deep and this pill is on every details modal and every
 * profile — see the note on that route.
 */
interface AwardsBadgeProps {
  /** Title (`tt…`) or person (`nm…`). Without one the pill does not open. */
  imdbId?: string;
  /** Pill text: "Won 3 Oscars", "3 Academy Awards · 3 Primetime Emmys". */
  label: string;
  /** Gold and a trophy when true; neutral and a medal when not. */
  won: boolean;
  /** Hover text for the pill — the fuller version of `label`. */
  tooltip?: string;
  /** Titles only: OMDb's sentence, shown above the itemised list. */
  summary?: string;
}

export function AwardsBadge({ imdbId, label, won, tooltip, summary }: AwardsBadgeProps) {
  const [open, setOpen] = useState(false);

  /*
     `null` until the panel is opened, which is what makes this lazy —
     `useFetch` treats a null url as "nothing to fetch" and the request only
     ever leaves once somebody asks for the detail.
  */
  const { data, loading, error, reload } = useFetch<AwardsPayload>(
    open && imdbId ? `/api/awards?imdb=${encodeURIComponent(imdbId)}` : null,
  );

  const tone = won
    ? "border-[#f5c518]/35 bg-[#f5c518]/10 text-[#f5c518]"
    : "border-white/12 bg-white/[0.04] text-on-surface-variant";

  const pill = (
    <>
      <Icon
        name={won ? "emoji_events" : "workspace_premium"}
        fill={won}
        style={{ fontSize: "15px" }}
      />
      {label}
      {imdbId ? (
        <Icon
          name="expand_more"
          style={{ fontSize: "16px" }}
          className={`opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      ) : null}
    </>
  );

  return (
    <div className="mt-3">
      {imdbId ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={tooltip}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label-md text-[12px] tracking-normal transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${tone}`}
        >
          {pill}
        </button>
      ) : (
        <span
          title={tooltip}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label-md text-[12px] tracking-normal ${tone}`}
        >
          {pill}
        </span>
      )}

      {/*
         Entrance only, and no `AnimatePresence`.

         Collapsing is instant on purpose. An exit animation runs on rAF, and
         this app has already been bitten once by that — see the note in
         `WatchTimeCard` about a card that never swapped its units in a
         backgrounded tab. A panel that refuses to close is a worse bug than a
         panel that closes without a flourish.
      */}
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-3 max-w-2xl rounded-DEFAULT border border-white/10 bg-surface-container/40 p-4"
        >
          {summary ? (
            <p className="mb-3 border-b border-white/10 pb-3 font-body-md text-[13px] text-on-surface-variant">
              {summary}
            </p>
          ) : null}

          {loading && !data ? (
            <div className="h-16 animate-pulse rounded-DEFAULT bg-white/5" />
          ) : error ? (
            /*
               Not the same as having nothing to show, and it took a bug report
               to make that distinction exist. Wikidata refuses a request often
               enough from a serverless address — shared outbound IP, looks like
               a scraper — that this is a state a reader will actually meet, and
               the panel used to render it as "nothing itemised" under a badge
               built from the very data it claimed was absent.

               The route answers a refusal with `no-store`, so pressing this
               genuinely re-asks rather than being handed the same cached
               nothing.
            */
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-body-md text-[13px] text-on-surface-variant">
                Couldn&rsquo;t reach Wikidata just now.
              </p>
              <button
                type="button"
                onClick={reload}
                className="rounded-full border border-white/15 px-3 py-1 font-label-md text-[12px] text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
              >
                Try again
              </button>
            </div>
          ) : data?.groups.length ? (
            <>
              {summary ? (
                /*
                   Only a title needs this line, and it needs it badly.

                   The pill's count is OMDb's and the list below is Wikidata's,
                   and they do not agree: OMDb has Oppenheimer at seven Oscars,
                   Wikidata itemises four of them. Neither is wrong — one
                   counts, the other records — but printed together with no
                   explanation the panel looks like it lost three awards.
                */
                <p className="mb-3 font-label-md text-[11px] uppercase tracking-widest text-on-surface/40">
                  Itemised on Wikidata
                </p>
              ) : null}

              <div className="space-y-4">
                {data.groups.map((group) => (
                  <div key={group.award}>
                    <h4 className="mb-1.5 font-label-md text-[11px] uppercase tracking-widest text-[#f5c518]/80">
                      {group.award}
                      <span className="ml-2 text-on-surface/35">{group.wins.length}</span>
                    </h4>
                    <ul className="space-y-1">
                      {group.wins.map((win, i) => (
                        <li
                          key={`${win.category}-${win.year ?? i}`}
                          className="flex flex-wrap items-baseline gap-x-2 font-body-md text-[13px] leading-snug"
                        >
                          <span className="w-9 shrink-0 tabular-nums text-on-surface/40">
                            {win.year ?? "—"}
                          </span>
                          <span className="text-on-surface">{win.category}</span>
                          {win.detail ? (
                            <span className="text-on-surface-variant/70">— {win.detail}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="font-body-md text-[13px] text-on-surface-variant">
              Nothing itemised on Wikidata for this one.
            </p>
          )}

          {data && data.others > 0 ? (
            <p className="mt-3 border-t border-white/10 pt-3 font-label-md text-[11px] text-on-surface/35">
              {data.others === 1
                ? "1 further award or honour on record"
                : `${data.others} further awards and honours on record`}{" "}
              — festival prizes, critics&rsquo; circles and state honours.
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
}
