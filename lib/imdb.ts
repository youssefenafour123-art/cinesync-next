import "server-only";
import type { MediaKind, SyncItem } from "./types";

/**
 * IMDb list reader.
 *
 * IMDb's HTML is behind AWS WAF, so server-side page scraping is impossible —
 * that's why the legacy app demanded a CSV export. Their GraphQL endpoint,
 * however, answers unauthenticated, which is what makes URL sync work.
 *
 * Note: IMDb attach a notice to these responses that the data is for limited
 * non-commercial use. This is a personal, local sync tool, which is that case.
 */

const ENDPOINT = "https://api.graphql.imdb.com/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Page size per GraphQL round trip, and a ceiling so a huge list can't hang. */
const PAGE_SIZE = 100;
const MAX_ITEMS = 2000;

export type ImdbRef =
  | { kind: "list"; id: string }
  | { kind: "watchlist"; userId: string };

/**
 * Accepts a full URL, a bare id, or a profile URL:
 *   https://www.imdb.com/list/ls024149810/
 *   https://www.imdb.com/user/ur12345678/watchlist
 *   ls024149810  ·  ur12345678
 */
export function parseImdbRef(input: string): ImdbRef | null {
  const raw = input.trim();
  if (!raw) return null;

  const list = raw.match(/\b(ls\d{6,})\b/i);
  if (list) return { kind: "list", id: list[1].toLowerCase() };

  const user = raw.match(/\b(ur\d{5,})\b/i);
  if (user) return { kind: "watchlist", userId: user[1].toLowerCase() };

  return null;
}

/** Thrown with a message that is safe and useful to show the user directly. */
export class ImdbError extends Error {}

interface TitleNode {
  id: string;
  titleText?: { text?: string };
  releaseYear?: { year?: number };
  titleType?: { id?: string; isSeries?: boolean };
}

interface SearchPage {
  total?: number;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  edges?: { title?: TitleNode }[];
}

interface ListPayload {
  id?: string;
  name?: { originalText?: string };
  visibility?: { id?: string };
  titleListItemSearch?: SearchPage;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "x-imdb-client-name": "imdb-web-next",
        Origin: "https://www.imdb.com",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch {
    throw new ImdbError("Couldn't reach IMDb. Check your connection and try again.");
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: T; errors?: { message?: string }[] }
    | null;

  if (!json) throw new ImdbError("IMDb returned an unreadable response.");

  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message ?? "").join(" ");
    if (/Permission denied|FORBIDDEN/i.test(msg)) {
      throw new ImdbError(
        "That IMDb watchlist is private. On IMDb go to Account Settings → Privacy and set " +
          "“Your watchlist” to Public, then try again — or upload the CSV export instead.",
      );
    }
    if (/Malformed list id|BAD_USER_INPUT/i.test(msg)) {
      throw new ImdbError("That doesn't look like a valid IMDb list or profile URL.");
    }
    throw new ImdbError(`IMDb rejected the request: ${msg.slice(0, 160)}`);
  }

  if (!json.data) throw new ImdbError("IMDb returned no data for that URL.");
  return json.data;
}

const PAGE_FIELDS = `
  total
  pageInfo { hasNextPage endCursor }
  edges { title { id titleText { text } releaseYear { year } titleType { id isSeries } } }
`;

const LIST_QUERY = `query L($id: ID!, $first: Int!, $after: String) {
  list(id: $id) {
    id
    name { originalText }
    visibility { id }
    titleListItemSearch(first: $first, after: $after) { ${PAGE_FIELDS} }
  }
}`;

const WATCHLIST_QUERY = `query W($userId: ID!, $first: Int!, $after: String) {
  predefinedList(classType: WATCH_LIST, userId: $userId) {
    id
    name { originalText }
    visibility { id }
    titleListItemSearch(first: $first, after: $after) { ${PAGE_FIELDS} }
  }
}`;

function toSyncItem(node: TitleNode): SyncItem | null {
  const id = node.id;
  const title = node.titleText?.text;
  if (!id?.startsWith("tt") || !title) return null;

  // IMDb flags series directly, which is more reliable than parsing a label.
  const kind: MediaKind = node.titleType?.isSeries ? "series" : "movie";
  return { id, title, type: kind, year: node.releaseYear?.year };
}

export interface ImdbListResult {
  name: string;
  items: SyncItem[];
  total: number;
  truncated: boolean;
}

/** Fetches a list or watchlist in full, following pagination. */
export async function fetchImdbList(ref: ImdbRef): Promise<ImdbListResult> {
  const items: SyncItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let name = ref.kind === "watchlist" ? "IMDb Watchlist" : "IMDb List";
  let total = 0;
  let guard = 0;

  do {
    const vars: Record<string, unknown> =
      ref.kind === "list"
        ? { id: ref.id, first: PAGE_SIZE, after: cursor }
        : { userId: ref.userId, first: PAGE_SIZE, after: cursor };

    const data: { list?: ListPayload; predefinedList?: ListPayload } = await gql(
      ref.kind === "list" ? LIST_QUERY : WATCHLIST_QUERY,
      vars,
    );

    const payload: ListPayload | undefined =
      ref.kind === "list" ? data.list : data.predefinedList;

    if (!payload) {
      throw new ImdbError(
        ref.kind === "watchlist"
          ? "No public watchlist found for that profile. It may be private, or the profile URL may be wrong."
          : "That IMDb list doesn't exist or isn't public.",
      );
    }

    if (payload.name?.originalText) name = payload.name.originalText;
    const page = payload.titleListItemSearch;
    total = page?.total ?? total;

    for (const edge of page?.edges ?? []) {
      if (!edge.title) continue;
      const item = toSyncItem(edge.title);
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }

    cursor = page?.pageInfo?.hasNextPage ? (page.pageInfo.endCursor ?? null) : null;
    guard++;
  } while (cursor && items.length < MAX_ITEMS && guard < MAX_ITEMS / PAGE_SIZE + 2);

  if (!items.length) {
    throw new ImdbError("That IMDb list is empty — nothing to sync.");
  }

  return { name, items, total: total || items.length, truncated: items.length >= MAX_ITEMS };
}
