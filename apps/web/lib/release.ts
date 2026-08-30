import type { MediaItem } from "./types";

/**
 * What to print where a title's release goes.
 *
 * TMDB dates every unreleased film whether or not anyone has announced one, so
 * the date alone cannot be printed as fact — `enrich` in lib/tmdb.ts sets
 * `releaseConfirmed` from the announced-releases record, and this is the rule
 * that reads it: the day when someone has actually named one, the year when
 * only the year is known, and "TBA" when even that isn't.
 *
 * Shared rather than repeated because it had already drifted. The tracker grid
 * applied it and the hero above it did not, so the same film could be a
 * confident "Dec 1, 2026" at the top of the tab and a bare "2026" six inches
 * below — and the confident one was the guess.
 */
export function releaseLabel(item: MediaItem): string {
  if (item.releaseIso && !item.releaseConfirmed) return item.releaseIso.slice(0, 4);
  return item.releaseDate ?? item.year ?? "TBA";
}
