"use client";

import type { MediaItem, MediaKind } from "./types";
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
  itemCount: number;
}

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

interface ListRow {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  is_watchlist: boolean;
  list_items: { count: number }[];
}

/** Every list belonging to the signed-in user, watchlist first. */
export async function fetchMyLists(): Promise<ListSummary[]> {
  const { data, error } = await supabaseBrowser()
    .from("lists")
    // The count comes back as an aggregate on the relation rather than a
    // second query per list.
    .select("id,name,description,visibility,is_watchlist,list_items(count)")
    .order("is_watchlist", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as ListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    isWatchlist: row.is_watchlist,
    itemCount: row.list_items?.[0]?.count ?? 0,
  }));
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

/** The signed-in user's watchlist row, creating nothing — the signup trigger owns that. */
export async function fetchWatchlistId(): Promise<string | null> {
  const { data, error } = await supabaseBrowser()
    .from("lists")
    .select("id")
    .eq("is_watchlist", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
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
      // Never from here. The one watchlist is the trigger's, and the partial
      // unique index would refuse a second anyway.
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
  userId: string,
  kind: MediaKind,
  rank: number,
  title: SavedTitle,
): Promise<void> {
  if (rank < 1 || rank > 5) throw new Error("A top five has five slots.");

  const { error } = await supabaseBrowser().from("favorites").upsert(
    {
      user_id: userId,
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

export async function clearFavourite(
  userId: string,
  kind: MediaKind,
  rank: number,
): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("favorites")
    .delete()
    .eq("user_id", userId)
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
