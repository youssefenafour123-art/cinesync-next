"use client";

/**
 * Which of a title's community posters to show this visit.
 *
 * One seed for the whole page load. That is the balance the rotation needs:
 * refreshing deals a new hand, but a title keeps the same face while you are
 * browsing, so a film does not change appearance between the rail you saw it
 * on and the modal you opened from it — or worse, flicker as React re-renders
 * the same card.
 *
 * Created lazily rather than at module scope so it is never generated during
 * server rendering. Posters only ever reach the DOM after `useFetch` resolves
 * on the client, so a server-rendered pick would be discarded anyway — but a
 * seed that differed between the two would be exactly the kind of hydration
 * mismatch this app already has one of.
 */
let seed: number | null = null;

function sessionSeed(): number {
  if (seed === null) {
    seed = typeof window === "undefined" ? 0 : Math.floor(Math.random() * 0x7fffffff);
  }
  return seed;
}

/**
 * Picks one poster deterministically from `variants`.
 *
 * Hashed on the primary URL rather than taken from a running counter, so the
 * choice depends on the title and not on render order — otherwise every card
 * in a rail would land on the same index, and a rail would be six posters that
 * all happen to be somebody's second choice.
 */
export function posterVariant(primary?: string, variants?: string[]): string | undefined {
  const list = variants?.length ? variants : primary ? [primary] : [];
  if (list.length <= 1) return list[0] ?? primary;

  let hash = sessionSeed();
  const key = primary ?? list[0];
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0;
  }

  return list[hash % list.length];
}

/**
 * The TMDB render width this screen actually needs.
 *
 * A poster card is about 150px wide on a phone and roughly 220 on a desktop
 * rail, so a `w500` file is between two and three times the pixels either
 * needs — and a rail is a dozen of them. TMDB serves fixed widths by path, so
 * this is a string swap rather than a resize.
 *
 * Only `w500` is rewritten, and only downward. Backdrops and profile images
 * come through other paths at their own widths and are left alone.
 */
export function sizedPoster(url?: string): string | undefined {
  if (!url || typeof window === "undefined") return url;
  return window.innerWidth <= 640 ? url.replace("/w500/", "/w342/") : url;
}
