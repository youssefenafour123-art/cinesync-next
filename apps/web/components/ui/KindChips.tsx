"use client";

import type { MediaKind } from "@/lib/types";
import type { SavedTitle } from "@/lib/lists";

/** "All" is not a kind, so the filter is a kind *or* the absence of one. */
export type KindFilter = "all" | MediaKind;

/**
 * Films / Shows / All, with counts.
 *
 * The Stremio shelf has had this since it was built; the saved shelves had
 * nothing, so a watched list of 97 was 39 films and 58 shows in one
 * undifferentiated wall. Lifted here rather than copied so the two behave
 * identically — the same three words, the same counts, the same pressed state.
 */
export function KindChips({
  value,
  counts,
  onChange,
  label,
}: {
  value: KindFilter;
  counts: Record<KindFilter, number>;
  onChange: (next: KindFilter) => void;
  /** Names the group for a screen reader: "Filter Watched by kind". */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 rounded-full border border-white/10 bg-surface-container/60 p-1"
    >
      {(["all", "movie", "series"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onChange(kind)}
          aria-pressed={value === kind}
          className={`rounded-full px-4 py-1.5 font-label-md text-[13px] transition-colors ${
            value === kind
              ? "bg-primary text-on-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {kind === "all" ? "All" : kind === "movie" ? "Films" : "Shows"} {counts[kind]}
        </button>
      ))}
    </div>
  );
}

/** How many of each kind a saved list holds, for the chips above it. */
export function countKinds(items: SavedTitle[]): Record<KindFilter, number> {
  let movie = 0;
  for (const item of items) if (item.kind === "movie") movie++;
  return { all: items.length, movie, series: items.length - movie };
}
