import "server-only";
import type { AwardTally, PersonAwards } from "./types";

/**
 * What a person has actually won, from Wikidata's structured statements.
 *
 * ## Why not the source the titles use
 *
 * `omdb.ts` answers this for films and series, and it cannot answer it here:
 * OMDb is keyed by IMDb *title* id and has no notion of a person. Nor is there
 * a second aggregator to fall back on — IMDb's own awards pages are the
 * canonical record and have no public API, and scraping them is against their
 * terms.
 *
 * Wikidata does have it, as data rather than prose. Every award a person has
 * received is a separate `award received` (P166) statement on their item, and
 * the item is reachable from the IMDb id they already carry (P345) — the same
 * route `wikipedia.ts` uses to find an article, so a person is never matched by
 * name and nobody inherits somebody else's Oscar.
 *
 * ## Why the count is trustworthy
 *
 * P166 means *received*, full stop. Wikidata keeps nominations in a different
 * property (`nominated for`, P1411), so unlike OMDb's one-line prose there is
 * no sentence to misread — a statement here cannot be a near miss. And a win
 * repeated is a statement repeated: Bryan Cranston carries four separate
 * "Primetime Emmy Award for Outstanding Lead Actor in a Drama Series"
 * statements, which is exactly how many he has. Counting statements is the
 * right arithmetic, and deduplicating them would be the bug.
 *
 * ## Why only some of them are counted
 *
 * A person's P166 list is not a list of screen awards. Morgan Freeman's holds
 * a Kennedy Center Honor, a National Medal of Arts and a star on the Hollywood
 * Walk of Fame; Meryl Streep's holds an honorary doctorate from Princeton and
 * the Presidential Medal of Freedom. Those are real and none of them is what
 * someone means by "has she won anything".
 *
 * So only the bodies in `BODIES` are counted, and each pattern insists on a
 * *category* — "Academy Award for Best Actress", not the bare "Academy Awards"
 * that some items carry as a vague pointer at the ceremony. That bare form is
 * what would otherwise inflate a count: Quentin Tarantino's item has his two
 * screenplay Oscars *and* a loose "Academy Awards" statement, and counting all
 * three would credit him with an Oscar he did not win. Requiring the category
 * can undercount slightly — Freeman's Golden Globes are recorded only in the
 * vague form and so go unmentioned — and that is the direction to err in.
 *
 * Checked against five people whose totals are not in dispute: Freeman 1 Oscar,
 * Streep 3, Nolan 2, Tarantino 2, Cranston 4 Primetime Emmys.
 */

const UA = "CineSync/1.0 (media dashboard; contact via app repository)";
const API = "https://www.wikidata.org/w/api.php";

/**
 * A week, against the day the rest of the app uses.
 *
 * Awards are handed out on a calendar and this is three requests deep, so
 * re-asking daily would spend a lot to learn nothing. The worst case is a
 * badge that is a few days behind on Oscar night.
 */
const WEEK = 604_800;

/**
 * One Wikidata call, retried once.
 *
 * The retry is not defensive programming for its own sake — it was earned.
 * Asking about seven people in quick succession is twenty-one requests, and
 * Wikidata throttled the tail of them: four profiles came back with no awards
 * at all, then showed the right ones a minute later. That is the shape of
 * failure worth handling, because the alternative is a badge that is missing
 * for as long as the route's day-long cache holds the render it was missing
 * from.
 *
 * Failures are not cached — the retry recovered on its own the first time,
 * which is what says so — so a second attempt genuinely re-asks rather than
 * being handed the same refusal.
 */
async function wd<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        // Wikidata asks callers to identify themselves and throttles the ones
        // that don't. Same string `wikipedia.ts` sends.
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: WEEK },
      });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // Network-level failure. Same treatment as a refusal.
    }
    // Long enough to clear a burst limit, short enough that a person profile
    // does not visibly wait on it.
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

interface SearchResponse {
  query?: { search?: { title?: string }[] };
}

interface ClaimsResponse {
  entities?: Record<
    string,
    { claims?: { P166?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[] } }
  >;
}

interface LabelsResponse {
  entities?: Record<string, { labels?: { en?: { value?: string } } }>;
}

/** One award body, and what to call it once it is on a badge. */
interface Body {
  /**
   * Matched against the award's full English label. Every pattern requires a
   * category rather than a bare ceremony name — see the note above.
   */
  test: RegExp;
  one: string;
  many: string;
}

/**
 * The bodies worth naming, most prestigious first.
 *
 * Order is the display order, so a person with several is described by the one
 * that means most. Deliberately short: a badge listing eight critics' circles
 * says less than one saying "3 Academy Awards", and the long tail is where
 * Wikidata's coverage is thinnest anyway.
 */
const BODIES: Body[] = [
  { test: /^Academy Award for /, one: "Academy Award", many: "Academy Awards" },
  { test: /^Primetime Emmy Award for /, one: "Primetime Emmy", many: "Primetime Emmys" },
  { test: /^Golden Globe Award for /, one: "Golden Globe", many: "Golden Globes" },
  { test: /^BAFTA Award for /, one: "BAFTA", many: "BAFTAs" },
  // The one entry with no category to require: the Palme d'Or has no
  // sub-awards, so its label is the whole of it.
  { test: /^Palme d'Or$/, one: "Palme d'Or", many: "Palmes d'Or" },
  { test: /^Screen Actors Guild Award for /, one: "SAG Award", many: "SAG Awards" },
  { test: /^Tony Award for /, one: "Tony Award", many: "Tony Awards" },
  { test: /^Grammy Award for /, one: "Grammy", many: "Grammys" },
];

/** How many bodies the badge names before it stops being a badge. */
const SHOWN = 2;

/**
 * Groups award labels into tallies. Exported for the sake of being checkable
 * against real label lists; nothing else imports it.
 */
export function tally(labels: string[]): AwardTally[] {
  const counts = new Map<string, number>();

  for (const label of labels) {
    const body = BODIES.find((b) => b.test.test(label));
    if (!body) continue;
    counts.set(body.one, (counts.get(body.one) ?? 0) + 1);
  }

  // Back into BODIES order, which is prestige order.
  return BODIES.filter((b) => counts.has(b.one)).map((b) => {
    const count = counts.get(b.one) as number;
    return { award: count === 1 ? b.one : b.many, count };
  });
}

function phrase(t: AwardTally): string {
  return `${t.count} ${t.award}`;
}

/**
 * Every recognised award one person has won, or nothing.
 *
 * Three requests on a cold cache — find the item, read its statements, resolve
 * the statements' labels — and none on a warm one. `null` for a person with no
 * Wikidata item, no P166 statements, or none this cares about, which is the
 * common case and renders nothing rather than an empty badge.
 */
export async function fetchPersonAwards(imdbId: string): Promise<PersonAwards | null> {
  if (!/^nm\d+$/.test(imdbId)) return null;

  const search = await wd<SearchResponse>(
    `${API}?action=query&format=json&list=search&srlimit=1` +
      `&srsearch=${encodeURIComponent(`haswbstatement:P345=${imdbId}`)}`,
  );
  const qid = search?.query?.search?.[0]?.title;
  if (!qid) return null;

  const entity = await wd<ClaimsResponse>(
    `${API}?action=wbgetentities&format=json&props=claims&ids=${encodeURIComponent(qid)}`,
  );
  const claims = entity?.entities?.[qid]?.claims?.P166 ?? [];
  if (!claims.length) return null;

  // The statements point at award items by id; the labels are a second call.
  // Ids are deduplicated for the *lookup* only — the claim list keeps its
  // repeats, because a repeat is a second win.
  const ids = claims.map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean) as string[];
  const unique = [...new Set(ids)];
  if (!unique.length) return null;

  const labels = new Map<string, string>();
  // wbgetentities takes at most 50 ids per call. Only the busiest careers get
  // past one page.
  for (let i = 0; i < unique.length; i += 50) {
    const page = await wd<LabelsResponse>(
      `${API}?action=wbgetentities&format=json&props=labels&languages=en` +
        `&ids=${unique.slice(i, i + 50).join("|")}`,
    );
    for (const [id, ent] of Object.entries(page?.entities ?? {})) {
      const value = ent.labels?.en?.value;
      if (value) labels.set(id, value);
    }
  }

  const tallies = tally(ids.map((id) => labels.get(id)).filter(Boolean) as string[]);
  if (!tallies.length) return null;

  return {
    label: tallies.slice(0, SHOWN).map(phrase).join(" · "),
    tallies,
  };
}
