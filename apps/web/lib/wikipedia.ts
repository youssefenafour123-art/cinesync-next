import "server-only";
import type { CriticReview, CriticalReception } from "./types";

/**
 * Named press critics — Roger Ebert, Pauline Kael, Manohla Dargis, Peter
 * Travers — pulled out of the "Critical response" section of the film's
 * English Wikipedia article.
 *
 * Why this source. Rotten Tomatoes and Metacritic are the obvious places to
 * find press criticism and neither one has a public API; both forbid scraping.
 * OMDb (see `omdb.ts`) legitimately redistributes their *scores* but carries no
 * written criticism, and TMDB's reviews are written by TMDB members. So the
 * app had aggregate numbers and community reviews and nothing from the press —
 * which is what "critics aren't displayed" was about.
 *
 * Wikipedia's reception sections are the one free, licensed, attributable
 * source that actually names critics and quotes them, and they are exactly the
 * critics that matter: the article summarises the notable reviews. What the UI
 * shows is Wikipedia's prose, credited to Wikipedia (CC BY-SA) and linked back
 * to the article — not the critic's own review text, which isn't ours to
 * republish.
 *
 * The article is resolved through Wikidata by IMDb id (property P345), so a
 * title is never matched by name — no film gets another film's reviews.
 */

const UA = "CineSync/1.0 (media dashboard; contact via app repository)";
const DAY = 86400;

async function wiki<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: DAY },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---- Article lookup ---- */

interface SearchResponse {
  query?: { search?: { title?: string }[] };
}

interface EntitiesResponse {
  entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }>;
}

/** IMDb id → English Wikipedia article title, via the Wikidata item. */
async function resolveArticle(imdbId: string): Promise<string | null> {
  const search = await wiki<SearchResponse>(
    "https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=1" +
      `&srsearch=${encodeURIComponent(`haswbstatement:P345=${imdbId}`)}`,
  );
  const qid = search?.query?.search?.[0]?.title;
  if (!qid) return null;

  const entity = await wiki<EntitiesResponse>(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json" +
      `&props=sitelinks&sitefilter=enwiki&ids=${encodeURIComponent(qid)}`,
  );
  return entity?.entities?.[qid]?.sitelinks?.enwiki?.title ?? null;
}

interface ExtractResponse {
  query?: { pages?: Record<string, { extract?: string }> };
}

async function fetchExtract(title: string): Promise<string | null> {
  const data = await wiki<ExtractResponse>(
    "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts" +
      `&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const pages = data?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0]?.extract ?? null;
}

/* ---- Section + sentence handling ---- */

/**
 * The reception prose, preferring the narrowest heading available. A bare
 * "Reception" heading also covers box office and awards, so the extraction
 * stops at the next heading of the same depth and drops nested sub-headings.
 */
function receptionSection(text: string): string {
  const headings = [
    /\n=+ ?(?:Critical response|Critical reception)[^=\n]*=+\n/i,
    /\n=+ ?(?:Reception|Critical analysis|Response|Reviews)[^=\n]*=+\n/i,
  ];

  for (const heading of headings) {
    const match = text.match(heading);
    if (!match || match.index === undefined) continue;

    const depth = (match[0].match(/=/g)?.length ?? 4) / 2;
    let body = text.slice(match.index + match[0].length);

    const next = body.match(new RegExp(`\\n={1,${depth}} [^=\\n]+ ={1,${depth}}\\n`));
    if (next?.index !== undefined) body = body.slice(0, next.index);

    body = body.replace(/\n=+ ?[^=\n]+ ?=+\n/g, "\n");
    if (body.trim().length > 200) return body;
  }

  return "";
}

/**
 * Sentence split tuned for these sections, which are dense with both
 * abbreviations and quotations: "The A.V. Club's Matthew Jackson" must not
 * break after "A.V.", and a sentence closing on a quote mark — the usual shape
 * here, since half of them end in the critic's own words — has to break after
 * that quote rather than before it, or the mark lands on the next excerpt.
 */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(
      /(?<=[.!?]["”’')\]]?)(?<!\b[A-Z]\.)(?<!\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|vs|No|Vol|Inc|Co|etc)\.)\s+(?=[A-Z"'“])/,
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ---- Attribution ---- */

/**
 * Outlets we're willing to credit. Requiring a known publication is what keeps
 * the extraction honest: "the 100 Greatest TV Shows of All Time" also parses as
 * "<name> of <publication>", and a whitelist is the cheapest way to say no to
 * it. Missing a niche outlet costs one card; inventing an attribution is worse.
 */
const PUBLICATIONS = [
  "The New York Times", "The Washington Post", "Los Angeles Times", "Chicago Tribune",
  "Chicago Sun-Times", "Chicago Reader", "The Wall Street Journal", "USA Today",
  "The Boston Globe", "San Francisco Chronicle", "The Philadelphia Inquirer",
  "The Seattle Times", "The Denver Post", "The Dallas Morning News", "Detroit Free Press",
  "Newsday", "New York Daily News", "New York Post", "The Miami Herald", "The Star-Ledger",
  "The Village Voice", "The Austin Chronicle", "St. Louis Post-Dispatch",
  "The Guardian", "The Observer", "The Times", "The Sunday Times", "The Daily Telegraph",
  "The Telegraph", "The Independent", "Evening Standard", "Financial Times", "Daily Mail",
  "The Irish Times", "The Globe and Mail", "Toronto Star", "The Sydney Morning Herald",
  "The Age", "The Australian", "The Japan Times", "South China Morning Post",
  "Hindustan Times", "The Times of India", "The Hindu", "Firstpost",
  "Variety", "The Hollywood Reporter", "Deadline Hollywood", "IndieWire",
  "Screen International", "Screen Daily", "TheWrap", "The Wrap", "Entertainment Weekly",
  "Rolling Stone", "Empire", "Total Film", "Sight and Sound", "Sight & Sound",
  "Little White Lies", "Time Out", "Cahiers du Cinéma", "RogerEbert.com", "The Playlist",
  "Collider", "Screen Rant", "ScreenRant", "MovieWeb", "Slashfilm", "/Film",
  "Time", "Newsweek", "The New Yorker", "The Atlantic", "New York", "Vulture",
  "The A.V. Club", "AV Club", "Slant Magazine", "Slate", "Salon", "Vox", "The Verge",
  "Polygon", "IGN", "GameSpot", "The Daily Beast", "HuffPost", "The Huffington Post",
  "The Ringer", "Paste", "Consequence", "Consequence of Sound", "Uproxx", "Thrillist",
  "Esquire", "GQ", "Vanity Fair", "Elle", "Vogue", "Wired", "Mashable", "Inverse",
  "BBC", "BBC News", "CNN", "NPR", "Associated Press", "The Associated Press", "Reuters",
  "NBC News", "ABC News", "CBS News", "Forbes", "Bloomberg", "The Economist",
  "National Review", "The Nation", "Jacobin", "Reason", "The New Republic",
  "The Spectator", "New Statesman", "The Week", "Digital Spy", "Radio Times",
  "TV Guide", "TVLine", "Decider", "Le Monde", "Der Spiegel", "Die Zeit",
];

// Longest first, so "The New York Times" wins the match over "The Times".
const SORTED_PUBLICATIONS = [...new Set(PUBLICATIONS)].sort((a, b) => b.length - a.length);
const PUB_SET = new Set(SORTED_PUBLICATIONS.map((p) => p.toLowerCase()));
const PUB = SORTED_PUBLICATIONS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const NAME = String.raw`[A-Z][\w.'’-]*(?: (?:[A-Z][\w.'’-]*|van|von|de|der|di|del|la|le))+`;

const RULES: { re: RegExp; critic: 1 | 2; publication: 1 | 2 }[] = [
  // "Manohla Dargis of The New York Times"
  { re: new RegExp(String.raw`\b(${NAME}),? (?:of|from) (?:the )?(${PUB})\b`), critic: 1, publication: 2 },
  // "Peter Suderman, writing for Reason"
  { re: new RegExp(String.raw`\b(${NAME}),? (?:writing|reviewing) (?:for|in) (?:the )?(${PUB})\b`), critic: 1, publication: 2 },
  // "Empire's Dan Jolin", "The A.V. Club's Matthew Jackson"
  { re: new RegExp(String.raw`\b(${PUB})['’]s (${NAME})\b`), critic: 2, publication: 1 },
  // "In his review for the Chicago Tribune, Michael Phillips called…"
  { re: new RegExp(String.raw`\breview (?:for|in) (?:the )?(${PUB}),? (${NAME})\b`), critic: 2, publication: 1 },
  // "Kenneth Turan's Los Angeles Times review"
  { re: new RegExp(String.raw`\b(${NAME})['’]s (?:the )?(${PUB}) review\b`), critic: 1, publication: 2 },
];

/** Sentence openers that a name-shaped match tends to swallow. */
const NOT_A_NAME = new Set([
  "the", "a", "an", "on", "in", "it", "he", "she", "they", "audiences", "critics",
  "metacritic", "rotten", "cinemascore", "posttrak", "some", "many", "other", "others",
  "conversely", "however", "writing", "reviews", "review", "while", "although", "despite",
  "both", "several", "most", "according", "film", "best", "greatest", "even", "meanwhile",
  "similarly", "additionally", "likewise", "overall", "nevertheless", "elsewhere", "although",
]);

function cleanName(raw: string): string | null {
  let words = raw.replace(/['’]s$/, "").split(" ");
  // "Even Kenneth Turan's …" — the regex is greedy leftward, so shave the
  // leading connective off rather than throwing the whole match away.
  while (words.length > 2 && NOT_A_NAME.has(words[0].toLowerCase())) words = words.slice(1);

  if (words.length < 2 || words.length > 4) return null;
  if (NOT_A_NAME.has(words[0].toLowerCase())) return null;

  const name = words.join(" ");
  if (PUB_SET.has(name.toLowerCase())) return null;
  return name;
}

/* ---- Star ratings ---- */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function toNumber(token: string): number | null {
  const word = WORD_NUMBERS[token.toLowerCase()];
  if (word !== undefined) return word;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

const SCORE_RE = new RegExp(
  String.raw`\b(\d(?:\.\d)?|one|two|three|four|five|six|seven|eight|nine|ten)` +
    String.raw`((?:-|\s)and(?:-|\s)a(?:-|\s)half)?\s*(?:out of|\/)\s*(?:a possible\s*)?` +
    String.raw`(\d{1,2}|four|five|ten)\b`,
  "i",
);

/** "gave it four out of four" → "4/4". Only read when the sentence is scoring. */
function starRating(sentence: string): string | undefined {
  if (!/\b(star|stars|gave|awarded|rated|graded)\b/i.test(sentence)) return undefined;

  const m = sentence.match(SCORE_RE);
  if (!m) return undefined;

  const value = toNumber(m[1]);
  const outOf = toNumber(m[3]);
  if (value === null || outOf === null) return undefined;
  if (outOf < 4 || outOf > 10 || value > outOf) return undefined;

  return `${m[2] ? value + 0.5 : value}/${outOf}`;
}

/* ---- Aggregates ---- */

function parseAggregates(body: string) {
  const rt =
    body.match(/Rotten Tomatoes,?\s+(\d{1,3})%\s+of\s+([\d,]+)\s+critics/i) ??
    body.match(
      /Rotten Tomatoes[^.]{0,90}?approval rating of\s+(\d{1,3})%\s+based on\s+([\d,]+)\s+(?:critic )?reviews/i,
    );
  const mc = body.match(
    /Metacritic[^.]{0,140}?(\d{1,3})\s+out of\s+100,?\s+based on\s+([\d,]+)\s+critics?/i,
  );
  const consensus = body.match(/consensus reads,?\s*["“]([^"”]+)["”]/i);
  const label = body.match(/indicating\s+["“]?((?:universal|generally|mixed|overwhelming)[a-z ]*?)["”]?(?:\s+reviews)?[.,]/i);

  return {
    rottenTomatoes: rt ? `${rt[1]}%` : undefined,
    rottenTomatoesCount: rt ? rt[2] : undefined,
    metacritic: mc ? `${mc[1]}/100` : undefined,
    metacriticCount: mc ? mc[2] : undefined,
    metacriticLabel: label ? label[1].trim() : undefined,
    consensus: consensus ? consensus[1].trim() : undefined,
  };
}

/* ---- Entry point ---- */

const AGGREGATE_OPENER =
  /^(On review aggregation|On Rotten Tomatoes|On the review aggregator|Rotten Tomatoes|Metacritic|Audiences polled|The website's consensus|The site's consensus|The website's critical consensus)/i;

function parseCritics(body: string): CriticReview[] {
  const reviews: CriticReview[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences(body)) {
    if (AGGREGATE_OPENER.test(sentence)) continue;

    for (const rule of RULES) {
      const m = sentence.match(rule.re);
      if (!m) continue;

      const critic = cleanName(m[rule.critic]);
      if (!critic) continue;

      const key = critic.toLowerCase();
      if (seen.has(key)) break;
      seen.add(key);

      reviews.push({
        critic,
        publication: m[rule.publication],
        excerpt: sentence,
        stars: starRating(sentence),
      });
      break;
    }

    if (reviews.length >= 12) break;
  }

  return reviews;
}

export async function fetchCriticalReception(imdbId: string): Promise<CriticalReception | null> {
  if (!imdbId.startsWith("tt")) return null;

  const title = await resolveArticle(imdbId);
  if (!title) return null;

  const extract = await fetchExtract(title);
  if (!extract) return null;

  const body = receptionSection(extract);
  if (!body) return null;

  const aggregates = parseAggregates(body);
  const reviews = parseCritics(body);
  if (!reviews.length && !aggregates.rottenTomatoes && !aggregates.metacritic) return null;

  return {
    source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    sourceTitle: title,
    reviews,
    ...aggregates,
  };
}
