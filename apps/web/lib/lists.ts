"use client";

import type { MediaItem, MediaKind, SyncItem } from "./types";
import { supabaseBrowser } from "./supabase/client";

/**
 * Watchlist, lists and top fives.
 *
 * These talk to Supabase directly rather than through `/api/*`, which is a
 * departure from every other data path in this app and worth justifying.
 *
 * The plan called for route handlers marked `private, no-store`, because the
 * fourteen existing routes all send `public, s-maxage=3600` and one of those
 * headers on a per-user route would serve one account's lists to another
 * through the CDN. That risk is real — but the safest way to handle a
 * dangerous mechanism is not to be careful with it, it is not to use it. There
 * is no CDN in front of Supabase's REST endpoint, no shared cache to poison,
 * and no second place where "is this person allowed to see this" can be got
 * wrong: the row-level security policies decide, and they are the same
 * policies whether the request comes from here, from a route handler, or from
 * a phone.
 *
 * The catalogue routes stay exactly as they are. They serve identical data to
 * everybody and their caching is what makes the app quick.
 */

export interface SavedTitle {
  imdbId: string;
  tmdbId?: number;
  kind: MediaKind;
  title: string;
  poster?: string;
}

/**
 * Who may read a list.
 *
 * Three states, not a boolean: "only me", "the people who follow me" and
 * "anyone". A flag could express the first and last and had no way to say the
 * middle one, which is the default.
 */
export type Visibility = "private" | "followers" | "public";

export interface ListSummary {
  id: string;
  name: string;
  description?: string;
  visibility: Visibility;
  isWatchlist: boolean;
  isWatched: boolean;
  isStremio: boolean;
  itemCount: number;
}

/**
 * The three lists the database makes for you.
 *
 * A flag column each on `lists`, rather than a `kind` — that is how the
 * watchlist was already modelled, and a partial unique index per flag is what
 * keeps there being exactly one of each per account.
 *
 * `is_stremio` is the odd one of the three: the other two are records the
 * account writes by pressing a button, and that one is a mirror of whatever
 * the connected Stremio accounts hold, written by `useStremioListSync`. It is
 * a list all the same, which is the point — it gets the visibility menu, the
 * profile row and the follower read without any of them being written twice.
 */
export type SystemListColumn = "is_watchlist" | "is_watched" | "is_stremio";

export interface Favourite extends SavedTitle {
  rank: number;
}

/** A title has to have an IMDb id to be saved — it is the key everything joins on. */
export function toSavedTitle(item: MediaItem): SavedTitle {
  if (!item.imdbId) {
    throw new Error("This title has no IMDb ID yet, so it can't be saved.");
  }
  return {
    imdbId: item.imdbId,
    tmdbId: item.tmdbId,
    kind: item.kind,
    title: item.title,
    poster: item.poster,
  };
}

/**
 * A title arriving from an IMDb import rather than from a screen in this app.
 *
 * An export carries an id, a name and a title type and nothing else, which is
 * exactly `SavedTitle` minus the poster — and the poster is left off on
 * purpose: `SavedTitleGrid` already falls back to metahub's poster for the id,
 * so writing that URL onto two thousand rows would store a value that is
 * derivable today and wrong the day metahub moves.
 *
 * Titles are clamped to the `list_items_title_length` check from 0007. A row
 * over it is refused, and one refused row must not be able to take the batch
 * it travelled in down with it.
 */
export function fromSyncItem(item: SyncItem): SavedTitle {
  return { imdbId: item.id, kind: item.type, title: item.title.slice(0, 300) };
}

interface ListRow {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  is_watchlist: boolean;
  is_watched?: boolean;
  is_stremio?: boolean;
  list_items: { count: number }[];
}

/*
   The select, and the same select with each later column taken back off.

   Migrations here are run by hand against production, so there is a window
   where the deployed code is ahead of the schema. Asking for a column that
   does not exist yet fails the whole query — every list would vanish from the
   Library and the profile until someone opened the SQL editor. Falling back
   costs one retry per missing column in that window and nothing afterwards.

   Ordered newest-first, so a database at 0009 pays one retry and a database at
   0008 pays two.
*/
const LIST_COLUMN_SETS = [
  "id,name,description,visibility,is_watchlist,is_watched,is_stremio,list_items(count)",
  "id,name,description,visibility,is_watchlist,is_watched,list_items(count)",
  "id,name,description,visibility,is_watchlist,list_items(count)",
];

/** Whether an error is Postgres saying it has never heard of that column. */
function isMissingColumn(message: string, column?: string): boolean {
  if (!/(does not exist|column)/i.test(message)) return false;
  return column ? message.includes(column) : /is_watched|is_stremio/.test(message);
}

/**
 * Every list belonging to the signed-in user, watchlist first.
 *
 * The `user_id` filter matters as soon as anybody follows anybody. The select
 * policy grants every list the reader is *allowed* to see — their own, plus
 * public ones, plus followers-only ones belonging to people they follow — so
 * leaning on RLS alone made "My Lists" mean "every list I can see" the moment
 * the follow graph stopped being empty.
 */
export async function fetchMyLists(userId: string): Promise<ListSummary[]> {
  const read = (columns: string) =>
    supabaseBrowser()
      .from("lists")
      // The count comes back as an aggregate on the relation rather than a
      // second query per list.
      .select(columns)
      .eq("user_id", userId)
      .order("is_watchlist", { ascending: false })
      .order("created_at", { ascending: true });

  let { data, error } = await read(LIST_COLUMN_SETS[0]);
  for (let i = 1; i < LIST_COLUMN_SETS.length && error && isMissingColumn(error.message); i++) {
    ({ data, error } = await read(LIST_COLUMN_SETS[i]));
  }

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as ListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    isWatchlist: row.is_watchlist,
    isWatched: row.is_watched ?? false,
    isStremio: row.is_stremio ?? false,
    itemCount: row.list_items?.[0]?.count ?? 0,
  }));
}

/**
 * Someone else's lists — as many of them as the reader is allowed to see.
 *
 * No visibility filter here and none needed: the select policy is
 * `can_view(user_id, visibility)`, so a private list is not withheld by this
 * query, it never arrives. That is deliberately the same call `fetchMyLists`
 * makes; the difference is only whose id goes in, which is why passing your
 * own returns everything and passing a stranger's returns their public ones.
 */
export async function fetchListsVisibleTo(userId: string): Promise<ListSummary[]> {
  return fetchMyLists(userId);
}

export async function fetchListItems(listId: string): Promise<SavedTitle[]> {
  const { data, error } = await supabaseBrowser()
    .from("list_items")
    .select("imdb_id,tmdb_id,kind,title,poster")
    .eq("list_id", listId)
    .order("added_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    imdbId: r.imdb_id as string,
    tmdbId: (r.tmdb_id as number | null) ?? undefined,
    kind: r.kind as MediaKind,
    title: r.title as string,
    poster: (r.poster as string | null) ?? undefined,
  }));
}

/**
 * One of the two lists the signup trigger owns, by user id. Creates nothing.
 *
 * Owner-filtered for the same reason as `fetchMyLists`, and here the
 * consequence was sharper: follow one person and `is_watchlist` alone matches
 * their watchlist too, so `maybeSingle()` throws on multiple rows and
 * `useWatchlist`'s catch turns that into every badge silently going dark.
 */
export async function fetchSystemListId(
  userId: string,
  column: SystemListColumn,
): Promise<string | null> {
  const { data, error } = await supabaseBrowser()
    .from("lists")
    .select("id")
    .eq("user_id", userId)
    .eq(column, true)
    .maybeSingle();

  if (error) {
    // Before 0008 runs there is no `is_watched` column, and before 0010 no
    // `is_stremio` — and in either case no such list to find. An account
    // without one behaves as an empty one rather than as an error nobody can
    // act on.
    if (isMissingColumn(error.message, column)) return null;
    throw new Error(error.message);
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** The watchlist, by the name the rest of the app knows it by. */
export function fetchWatchlistId(userId: string): Promise<string | null> {
  return fetchSystemListId(userId, "is_watchlist");
}

/**
 * Adds a title, or updates it if the list already holds it.
 *
 * `upsert` rather than insert, because the primary key is (list_id, imdb_id):
 * pressing the button twice should be indistinguishable from pressing it once,
 * not an error about a duplicate.
 */
export async function addToList(listId: string, title: SavedTitle): Promise<void> {
  const { error } = await supabaseBrowser().from("list_items").upsert(
    {
      list_id: listId,
      imdb_id: title.imdbId,
      tmdb_id: title.tmdbId ?? null,
      kind: title.kind,
      title: title.title,
      poster: title.poster ?? null,
    },
    { onConflict: "list_id,imdb_id" },
  );
  if (error) throw new Error(error.message);
}

/**
 * The same, for many titles at once.
 *
 * One request rather than one per title, because the caller that needs this is
 * the Stremio watch sync and a first run of it is ninety-odd rows — ninety-odd
 * round trips, at which point the list fills in visibly over fifteen seconds.
 *
 * The upsert conflict target is the same (list_id, imdb_id) primary key the
 * single-row version uses, so re-sending a title the list already holds is
 * still a no-op rather than an error.
 */
export async function addManyToList(listId: string, titles: SavedTitle[]): Promise<void> {
  if (titles.length === 0) return;

  const { error } = await supabaseBrowser()
    .from("list_items")
    .upsert(
      titles.map((title) => ({
        list_id: listId,
        imdb_id: title.imdbId,
        tmdb_id: title.tmdbId ?? null,
        kind: title.kind,
        title: title.title,
        poster: title.poster ?? null,
      })),
      { onConflict: "list_id,imdb_id" },
    );
  if (error) throw new Error(error.message);
}

/**
 * Which of the caller's lists already hold this title.
 *
 * One request rather than one per list, and scoped to ids the caller passed:
 * `list_items` is readable for every list the visibility policy allows, so an
 * unscoped query would also match somebody else's public list that happens to
 * contain the same film.
 */
export async function fetchListsHolding(
  imdbId: string,
  listIds: string[],
): Promise<Set<string>> {
  if (listIds.length === 0) return new Set();

  const { data, error } = await supabaseBrowser()
    .from("list_items")
    .select("list_id")
    .eq("imdb_id", imdbId)
    .in("list_id", listIds);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r as { list_id: string }).list_id));
}

/**
 * Removes several titles from one list at once.
 *
 * The counterpart to `addManyToList`, and it exists for the same caller: the
 * Stremio mirror, which has to write both halves of a diff. Deleting a
 * hundred titles one request at a time would make emptying a library the
 * slowest thing this app does, and a mirror that only ever grows is not a
 * mirror.
 */
export async function removeManyFromList(listId: string, imdbIds: string[]): Promise<void> {
  if (imdbIds.length === 0) return;

  const { error } = await supabaseBrowser()
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .in("imdb_id", imdbIds);
  if (error) throw new Error(error.message);
}

export async function removeFromList(listId: string, imdbId: string): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("imdb_id", imdbId);
  if (error) throw new Error(error.message);
}

export async function createList(
  name: string,
  options: { description?: string; visibility?: Visibility } = {},
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) {
    throw new Error("A list name is 1 to 60 characters.");
  }

  const { data, error } = await supabaseBrowser()
    .from("lists")
    .insert({
      name: trimmed,
      description: options.description?.trim() || null,
      // Matches the table default. A new list is shown to the people who
      // follow you, not to everyone, and not to nobody.
      visibility: options.visibility ?? "followers",
      // Never from here. The one watchlist and the one watched list are the
      // trigger's, and the partial unique indexes would refuse a second of
      // either anyway.
      is_watchlist: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteList(listId: string): Promise<void> {
  const { error } = await supabaseBrowser().from("lists").delete().eq("id", listId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ *
 * Top fives
 * ------------------------------------------------------------------ */

/**
 * Anyone's top five, by user id.
 *
 * Public, unlike lists — a top five is the headline of a profile, and a
 * profile nobody can read is not findable, which is the point of usernames.
 */
export async function fetchFavourites(userId: string, kind: MediaKind): Promise<Favourite[]> {
  const { data, error } = await supabaseBrowser()
    .from("favorites")
    .select("rank,imdb_id,tmdb_id,kind,title,poster")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("rank", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    rank: r.rank as number,
    imdbId: r.imdb_id as string,
    tmdbId: (r.tmdb_id as number | null) ?? undefined,
    kind: r.kind as MediaKind,
    title: r.title as string,
    poster: (r.poster as string | null) ?? undefined,
  }));
}

/**
 * Puts a title in one of the five slots, replacing whatever was there.
 *
 * The slot is the identity — (user_id, kind, rank) is the primary key — so
 * this is an upsert and not a delete-then-insert, which would leave the slot
 * empty if the second half failed.
 */
export async function setFavourite(
  kind: MediaKind,
  rank: number,
  title: SavedTitle,
): Promise<void> {
  if (rank < 1 || rank > 5) throw new Error("A top five has five slots.");

  // No `user_id`: the column defaults to `auth.uid()`, so the row is owned by
  // whoever is asking and there is no id for a caller to get wrong.
  const { error } = await supabaseBrowser().from("favorites").upsert(
    {
      kind,
      rank,
      imdb_id: title.imdbId,
      tmdb_id: title.tmdbId ?? null,
      title: title.title,
      poster: title.poster ?? null,
    },
    { onConflict: "user_id,kind,rank" },
  );

  if (error) {
    // The other unique index: the same title already occupies a different slot.
    if (/favorites_no_duplicate_title/.test(error.message)) {
      throw new Error(`${title.title} is already in your top five.`);
    }
    throw new Error(error.message);
  }
}

export async function clearFavourite(kind: MediaKind, rank: number): Promise<void> {
  // No user filter needed — the policy already restricts deletes to your own.
  const { error } = await supabaseBrowser()
    .from("favorites")
    .delete()
    .eq("kind", kind)
    .eq("rank", rank);
  if (error) throw new Error(error.message);
}

/** Changes who can see a list. */
export async function setListVisibility(listId: string, visibility: Visibility): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("lists")
    .update({ visibility })
    .eq("id", listId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ *
 * Following
 * ------------------------------------------------------------------ */

/** Follows someone. `follower_id` defaults to the caller. */
export async function follow(userId: string): Promise<void> {
  const { error } = await supabaseBrowser().from("follows").insert({ followee_id: userId });
  if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
}

export async function unfollow(userId: string): Promise<void> {
  const { error } = await supabaseBrowser().from("follows").delete().eq("followee_id", userId);
  if (error) throw new Error(error.message);
}
