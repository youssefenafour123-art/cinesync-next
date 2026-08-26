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
/**
 * The same idea for the backdrop wall, which is far more oversized than a rail.
 *
 * `.bg-wall-col` is 156px. The wall was rendering whatever the catalogue
 * returned — `w500` — which is 53KB a poster against 11KB at `w185`, and the
 * wall builds twelve columns of eight. That is roughly four megabytes spent on
 * a decoration that sits at 58% opacity behind a scrim, before the page has
 * finished the requests it actually needs.
 *
 * Two steps rather than one, on the same pixel-ratio test `sizedPoster` uses:
 * 156px at 2x wants 312 device pixels, which `w342` covers and `w185` would
 * visibly soften even through the grade.
 */
/**
 * What a hero should actually load behind its copy.
 *
 * Cinemeta hands back Metahub's `background/medium`, and that image is
 * **980KB** — there is no smaller variant: `background/small` returns a 93-byte
 * error and `large` is byte-identical to medium. On a phone that is five
 * seconds of a Fast 3G connection for artwork sitting behind two gradients on a
 * 390px screen, and the hero fetches a fresh one every time it advances a
 * slide: measured still arriving 36 seconds into a load, one per slide, long
 * after everything else had finished.
 *
 * Below `sm` the poster is used instead — around 50KB, cropped by
 * `object-cover` anyway, and exactly what the hero already falls back to for a
 * title with no backdrop at all. Above it nothing changes: a widescreen
 * backdrop filling a desktop hero is what that download is for.
 *
 * Reads the viewport at call time, the same way `sizedPoster` reads the pixel
 * ratio, and gives the desktop answer on the server where neither exists.
 */
export function heroBackdrop(backdrop?: string, poster?: string): string | undefined {
  if (typeof window === "undefined") return backdrop || poster;
  if (!backdrop) return poster;

  const narrow = window.matchMedia("(max-width: 639px)").matches;
  // Only Metahub's is unsizeable; a TMDB backdrop already arrives at w780.
  const heavy = backdrop.includes("images.metahub.space");

  return narrow && heavy && poster ? poster : backdrop;
}

export function backdropPoster(url: string): string {
  if (typeof window === "undefined") return url;
  return url.replace("/w500/", window.devicePixelRatio >= 1.5 ? "/w342/" : "/w185/");
}

export function sizedPoster(url?: string): string | undefined {
  if (!url || typeof window === "undefined") return url;
  /*
     Desktop steps down too, but only where the screen cannot show the
     difference.

     This used to fire below 640px only, so a 190px-wide rail card on a desktop
     downloaded `w500` — nearly three times the width it renders at. But the
     Curated tab's grid cards are close to 300px, and a 2x panel wants 600
     device pixels for those, so a blanket downgrade would visibly soften them.
     Pixel ratio is the honest test: on a 1x screen `w342` is still above every
     card size this app renders; on 2x, `w500` is the one that is short.
  */
  const dense = window.devicePixelRatio >= 1.5;
  if (dense) return url;
  return url.replace("/w500/", "/w342/");
}

/**
 * A rotating slice of a ranked list.
 *
 * The curated rails were the same twelve films on every visit, because the
 * ranking behind them is deterministic — same query, same weighting, same
 * winners. Widening the rail to show everything would not have helped either:
 * more titles on screen is not variety if it is the same more, every time.
 *
 * So the route returns a larger pool than fits and this takes a window of it,
 * moved along per page load. Everything in the pool cleared the same quality
 * floor, so a shifted window is not a worse rail — it is a different one.
 *
 * The window wraps, and the slice is left in rank order, so whatever is shown
 * still reads best-first rather than arriving shuffled.
 */
export function rotateWindow<T>(items: T[], take: number, key: string): T[] {
  if (items.length <= take) return items;

  let hash = sessionSeed();
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0;
  }

  const start = hash % items.length;
  const window: T[] = [];
  for (let i = 0; i < take; i++) window.push(items[(start + i) % items.length]);
  return window;
}
