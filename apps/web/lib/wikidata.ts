import "server-only";
import type { AwardTally, PersonAwards } from "./types";
import type { AwardGroup, AwardWin, AwardsPayload } from "@cinesync/shared/payloads";

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
 * Wikidata did not answer — as distinct from answering that it knows nothing.
 *
 * The distinction is the whole point of this class. Both used to come back as
 * an empty result, and an empty result is *cacheable*: a single throttled
 * request on production left Emma Stone's panel reading "nothing itemised on
 * Wikidata" under a badge that Wikidata itself had supplied, and the route's
 * week-long revalidation meant it would have said that for a week. Two of
 * eight people were in that state when it was found.
 *
 * So a refusal now throws and a genuine absence returns a value, and only the
 * second of those is allowed anywhere near a cache.
 */
export class WikidataUnavailable extends Error {
  constructor(url: string) {
    super(`Wikidata did not answer: ${url}`);
    this.name = "WikidataUnavailable";
  }
}

/** Backoff between attempts. Three tries, spread over about two seconds. */
const BACKOFF_MS = [400, 1200];

/**
 * One Wikidata call. Retries, then throws.
 *
 * The retries were earned rather than added on principle. Asking about seven
 * people in quick succession is twenty-one requests and Wikidata throttled the
 * tail of them; the same thing happens from a serverless function, where the
 * outbound address is shared with every other tenant on that host and arrives
 * at Wikidata looking a great deal like a scraper.
 *
 * Throwing rather than returning null is the fix for the caching bug above.
 * The caller cannot tell an empty answer from no answer by looking at a value,
 * so it is not asked to.
 */
async function wd<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
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
    const wait = BACKOFF_MS[attempt];
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  throw new WikidataUnavailable(url);
}

interface SearchResponse {
  query?: { search?: { title?: string }[] };
}

/**
 * IMDb id → Wikidata item id. Works for `tt…` and `nm…` alike: P345 is the
 * IMDb identifier property whatever kind of thing is being identified, which
 * is why one lookup serves both a film's awards and an actor's.
 */
async function resolveItem(imdbId: string): Promise<string | null> {
  const search = await wd<SearchResponse>(
    `${API}?action=query&format=json&list=search&srlimit=1` +
      `&srsearch=${encodeURIComponent(`haswbstatement:P345=${imdbId}`)}`,
  );
  // A successful search that matched nothing is a real answer: this person or
  // title has no Wikidata item. `wd` has already thrown if nobody answered.
  return search.query?.search?.[0]?.title ?? null;
}

/**
 * English labels for a set of item ids.
 *
 * `wbgetentities` takes at most 50 ids a call, so this pages. Ids are
 * deduplicated for the lookup only — callers keep their own repeats, because
 * for an award statement a repeat is a second win.
 */
async function labelsFor(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const unique = [...new Set(ids)];

  for (let i = 0; i < unique.length; i += 50) {
    const page = await wd<LabelsResponse>(
      `${API}?action=wbgetentities&format=json&props=labels&languages=en` +
        `&ids=${unique.slice(i, i + 50).join("|")}`,
    );
    for (const [id, ent] of Object.entries(page.entities ?? {})) {
      const value = ent.labels?.en?.value;
      if (value) labels.set(id, value);
    }
  }

  return labels;
}

/** One `award received` statement, with the qualifiers worth reading. */
interface AwardClaim {
  mainsnak?: { datavalue?: { value?: { id?: string } } };
  qualifiers?: {
    /** point in time — the year it was given. */
    P585?: { datavalue?: { value?: { time?: string } } }[];
    /** for work — what a *person* won it for. */
    P1686?: { datavalue?: { value?: { id?: string } } }[];
    /** winner — who won it, on a *title's* statement. */
    P1346?: { datavalue?: { value?: { id?: string } } }[];
  };
}

interface ClaimsResponse {
  entities?: Record<string, { claims?: { P166?: AwardClaim[] } }>;
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

  /*
     Still swallows a refusal, unlike `fetchAwardDetail` below, and the
     asymmetry is deliberate: this one is on the person route's critical path
     and its failure costs a badge, where that one *is* the answer and its
     failure has to be visible. A missing badge here is cached for the person
     route's day and then re-asked, which is the same self-healing behaviour it
     has always had.
  */
  const claims = await awardClaims(imdbId).catch(() => [] as AwardClaim[]);
  if (!claims.length) return null;

  const ids = claims.map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean) as string[];
  if (!ids.length) return null;

  // Only the award ids here. The qualifiers cost more labels to resolve and
  // this is on the person route's critical path; the itemised view asks for
  // them separately, and only when somebody opens it.
  const labels = await labelsFor(ids).catch(() => new Map<string, string>());
  const tallies = tally(ids.map((id) => labels.get(id)).filter(Boolean) as string[]);
  if (!tallies.length) return null;

  return {
    label: tallies.slice(0, SHOWN).map(phrase).join(" · "),
    tallies,
  };
}

/** The `award received` statements on whatever item an IMDb id resolves to. */
async function awardClaims(imdbId: string): Promise<AwardClaim[]> {
  const qid = await resolveItem(imdbId);
  if (!qid) return [];

  const entity = await wd<ClaimsResponse>(
    `${API}?action=wbgetentities&format=json&props=claims&ids=${encodeURIComponent(qid)}`,
  );
  return entity.entities?.[qid]?.claims?.P166 ?? [];
}

/** "+2016-01-01T00:00:00Z" → "2016". Wikidata times carry a leading sign. */
function yearOf(time?: string): string | undefined {
  const year = time?.slice(1, 5);
  return year && /^\d{4}$/.test(year) ? year : undefined;
}

/**
 * Every recognised award, itemised — category, year, and the other half of the
 * credit.
 *
 * The lazy half of the feature, and deliberately its own route rather than
 * more fields on the badge. The badge is on every person profile and every
 * details modal; this is three requests and a second round of label lookups,
 * and almost nobody opens it. Making the profile pay for it would have been
 * the wrong trade in exactly the way `enrich` versus `titleRuntimes` was.
 *
 * Serves titles and people from one implementation, because Wikidata models
 * them the same way. The only asymmetry is which qualifier carries the other
 * half of the credit: a person's statement says what they won it *for*
 * (P1686, a work), a title's says *who* won it (P1346, a person). Both land in
 * `detail`, and which one it is follows from what was asked about.
 */
export async function fetchAwardDetail(imdbId: string): Promise<AwardsPayload> {
  const empty: AwardsPayload = { groups: [], others: 0 };
  if (!/^(tt|nm)\d+$/.test(imdbId)) return empty;

  // Deliberately no catch anywhere below. A `WikidataUnavailable` has to reach
  // the route so it can answer with a status nothing will cache — see the
  // note on that class.


  const claims = await awardClaims(imdbId);
  if (!claims.length) return empty;

  const rows = claims.map((c) => ({
    award: c.mainsnak?.datavalue?.value?.id,
    year: yearOf(c.qualifiers?.P585?.[0]?.datavalue?.value?.time),
    // Whichever of the two the statement carries. They never both appear.
    detail:
      c.qualifiers?.P1686?.[0]?.datavalue?.value?.id ??
      c.qualifiers?.P1346?.[0]?.datavalue?.value?.id,
  }));

  const labels = await labelsFor(
    rows.flatMap((r) => [r.award, r.detail]).filter(Boolean) as string[],
  );

  const grouped = new Map<string, AwardWin[]>();
  let others = 0;

  for (const row of rows) {
    const label = row.award ? labels.get(row.award) : undefined;
    if (!label) continue;

    const body = BODIES.find((b) => b.test.test(label));
    if (!body) {
      // The long tail — festival prizes, critics' circles, state honours. The
      // badge already excludes them and the list says only how many there are.
      others += 1;
      continue;
    }

    const wins = grouped.get(body.one) ?? [];
    wins.push({
      // The heading already says the body, so the row says the category. A
      // label with no "for" clause — the Palme d'Or — keeps its whole name,
      // which is the only sensible thing to print for an award with no
      // categories.
      category: label.replace(/^.*? for /, "") || label,
      year: row.year,
      detail: row.detail ? labels.get(row.detail) : undefined,
    });
    grouped.set(body.one, wins);
  }

  const groups: AwardGroup[] = BODIES.filter((b) => grouped.has(b.one)).map((b) => {
    const wins = (grouped.get(b.one) as AwardWin[]).sort((x, y) =>
      // Oldest first: a career reads forwards, and an undated statement is
      // pinned to the end rather than pretending to be the earliest.
      (x.year ?? "9999").localeCompare(y.year ?? "9999"),
    );
    return { award: wins.length === 1 ? b.one : b.many, wins };
  });

  return { groups, others };
}
