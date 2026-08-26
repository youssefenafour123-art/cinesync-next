import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { curate } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";
import type { GemPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { GemPayload };

/**
 * One hidden gem, the same one for everybody, for a whole week.
 *
 * The Curated tab already has an "Under the Radar" rail and this is not a
 * second copy of it. A rail of twelve is a place to browse; the point of this
 * is that it is *one* title, it does not move for seven days, and it is small
 * enough on the page that it reads as a recommendation rather than a
 * merchandising slot. Twelve options is a menu — one is a suggestion.
 *
 * The filters are stricter than the rail's, in both directions. The quality
 * floor is higher, because a single pick has nowhere to hide; the vote ceiling
 * is lower, because a title everybody has already seen is not a gem however
 * good it is. Both catalogues feed one pool, so a week's pick may be a film or
 * a series, whichever the draw lands on.
 */
export async function GET() {
  try {
    const pool = await gemPool();
    const week = isoWeek(new Date());

    const payload: GemPayload = {
      item: pick(pool, week),
      week,
      nextAt: nextMonday(new Date()).toISOString(),
      why: "",
    };
    if (payload.item) payload.why = why(payload.item);

    return Response.json(payload, { headers: CATALOGUE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pick this week's gem";
    return Response.json({ error: message }, { status: 502 });
  }
}

/**
 * Cut-off for "the ratings have settled" — the same three years the Curated
 * tab uses, and for the same reason: a fresh release carries inflated early
 * ratings from the people who cared enough to turn up first.
 */
function settledBefore(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().split("T")[0];
}

/**
 * Animation, excluded from both halves of the pool.
 *
 * Not a judgement on animation — it is that this app has a whole Anime tab
 * whose entire job is that catalogue, and that TMDB's obscurity signal breaks
 * down here in a way it does not elsewhere. The low-vote, high-average window
 * these queries select on is where children's cartoons live: the television
 * pool without this line came back as Pokémon Horizons, Hot Wheels Battle
 * Force 5 and Bluey ranked above Das Boot, all of them honestly rated 8.6 by
 * the few hundred people who rate them. A weekly single pick has no room to
 * absorb that, and a rail would have.
 */
const ANIMATION = "16";

/** Children's television, out for the same reason and mostly the same titles. */
const KIDS = "10762";

/**
 * The candidates a week's pick is drawn from.
 *
 * A pool rather than a single query result, because the draw below has to be
 * able to land somewhere different each week without the ranking changing —
 * and because a pool of forty absorbs the ordinary week-to-week drift in
 * TMDB's vote counts without the pick moving.
 */
async function gemPool(): Promise<MediaItem[]> {
  const [films, series] = await Promise.all([
    curate(
      "movie",
      {
        "primary_release_date.lte": settledBefore(),
        // The window is the whole idea. The floor is enough votes for the
        // rating to mean something; the ceiling is the line past which a film
        // is common knowledge and recommending it says nothing.
        "vote_count.gte": "300",
        "vote_count.lte": "2500",
        "vote_average.gte": "7.2",
        sort_by: "vote_average.desc",
        // Documentaries, concert films and TV movies are rated on a different
        // scale and swamp any list they are allowed into. Animation is out
        // for a different reason — see `ANIMATION`.
        without_genres: `99,10402,10770,${ANIMATION}`,
      },
      { minVotes: 900, floor: 7.2, postFloor: 7.4, limit: 20, pages: 6, shortlist: 32 },
    ),

    /*
       Television draws far fewer TMDB votes than film at the same standing —
       one entry covers a whole run, and people rate a show once rather than
       per season — so the window is a different one, not the film window with
       a smaller number written in it.

       The vote floor is the part that was measured rather than guessed. At 80
       the pool filled with eighty-vote regional shows whose "average" is
       really the opinion of one very keen audience; at 150 the same query
       returns Reply 1988, My Mister, Das Boot, Kaamelott and Boris, which is
       what this card is for.

       The excluded genres differ too: news, talk, reality and soaps are the
       formats rated on their own scale here, and `KIDS` goes with them.
    */
    curate(
      "tv",
      {
        "first_air_date.lte": settledBefore(),
        "vote_count.gte": "150",
        "vote_count.lte": "900",
        "vote_average.gte": "7.4",
        sort_by: "vote_average.desc",
        without_genres: `99,10763,10767,10764,10766,${KIDS},${ANIMATION}`,
      },
      { minVotes: 250, floor: 7.4, postFloor: 7.4, limit: 14, pages: 6, shortlist: 26 },
    ),
  ]);

  // A gem has to be openable. Everything downstream — the details modal, the
  // watchlist, the library badge — joins on the IMDb id, and a pick without
  // one would be a card whose only control does nothing.
  return [...films, ...series].filter((item) => item.imdbId && item.poster && item.description);
}

/**
 * This week's pick, chosen so it does not wander.
 *
 * The obvious version — `pool[hash(week) % pool.length]` — is stable only for
 * as long as the pool is, and the pool is rebuilt hourly from a live
 * catalogue. One title crossing the vote ceiling on a Wednesday would reindex
 * everything after it and swap the pick mid-week, which is the one thing a
 * "recommendation of the week" must not do.
 *
 * So each candidate scores itself against the week — the rendezvous-hashing
 * trick — and the highest score wins. A title's score depends on nothing but
 * its own id and the week, so candidates arriving or leaving cannot disturb
 * the winner unless the winner is the one that left.
 */
function pick(pool: MediaItem[], week: string): MediaItem | null {
  let best: MediaItem | null = null;
  let bestScore = -1;

  for (const item of pool) {
    // The TMDB id, not the array position and not the title: it is the one
    // thing about a candidate that is guaranteed present and never rewritten.
    const score = hash(`${week}:${item.tmdbId ?? item.imdbId ?? item.key}`);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

/** FNV-1a, which is plenty for choosing a film and is not pretending otherwise. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * One line saying why this one, built only from what the providers reported.
 *
 * Nothing here is a judgement the app invented — the rating and the vote count
 * are the two numbers the filters above actually selected on, so the sentence
 * is a description of how the pick was made rather than a review of it.
 */
function why(item: MediaItem): string {
  const votes = item.voteCount ?? 0;
  const rating = item.rating;

  if (!rating || votes <= 0) {
    return "Well reviewed, and nowhere near as widely seen as it should be.";
  }

  return `Rated ${rating} on ${votes.toLocaleString("en-US")} votes — well reviewed, barely seen.`;
}

/**
 * The ISO week the given instant falls in, in UTC — `2026-W35`.
 *
 * UTC rather than the server's zone so the pick turns over at one moment for
 * everybody rather than whenever the machine that rendered the response
 * happens to think Monday started. Weeks begin on Monday, which is also what
 * `nextMonday` counts to.
 */
function isoWeek(now: Date): string {
  // Thursday of this week decides the year, which is the whole of ISO 8601's
  // week-numbering rule: a week belongs to the year holding most of its days.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Midnight UTC on the coming Monday — when this pick hands over to the next. */
function nextMonday(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() + (7 - day));
  return d;
}
