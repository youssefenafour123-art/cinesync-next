"use client";

import { supabaseBrowser } from "./supabase/client";

/**
 * A profile as the profile screen renders it.
 *
 * `username` is the only column guaranteed to be set — the signup trigger
 * writes it and the check constraint won't allow it empty. Everything else is
 * optional and the UI has to read well without any of it.
 */
export interface Profile {
  id: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  /** ISO timestamp. Formatted for display by `joinedOn` below. */
  createdAt: string;
}

export interface FollowCounts {
  followers: number;
  following: number;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? undefined,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Anyone's profile, by user id.
 *
 * Readable by everyone by policy — finding someone by username is the point of
 * having one — so this is the same call whether it is your profile or someone
 * else's, which is what lets phase 3 reuse the whole screen.
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseBrowser()
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toProfile(data as ProfileRow) : null;
}

/** The same, by the name people actually search for. */
export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabaseBrowser()
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,created_at")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toProfile(data as ProfileRow) : null;
}

/**
 * Profiles whose username contains what was typed.
 *
 * `ilike` rather than an exact match, because this is a search box and nobody
 * types a whole username. `citext` makes the column case-insensitive already;
 * the lower-casing here is for the wildcards around it.
 *
 * Yourself is excluded — the follow button beside your own name is a control
 * that can only disappoint, and `follows` has a check constraint refusing it
 * anyway.
 */
export async function searchProfiles(query: string, selfId?: string): Promise<Profile[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  let request = supabaseBrowser()
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,created_at")
    .ilike("username", `%${q}%`)
    .order("username")
    .limit(20);

  if (selfId) request = request.neq("id", selfId);

  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toProfile(row as ProfileRow));
}

/**
 * The profiles on one side of someone's follow graph.
 *
 * Two queries rather than a join: `follows` references `auth.users`, not
 * `profiles`, so PostgREST has no relationship between them to traverse. Read
 * the ids, then read the rows.
 */
async function profilesFromFollows(
  column: "follower_id" | "followee_id",
  matchColumn: "follower_id" | "followee_id",
  userId: string,
): Promise<Profile[]> {
  const client = supabaseBrowser();

  const { data: edges, error } = await client
    .from("follows")
    .select(column)
    .eq(matchColumn, userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const ids = (edges ?? []).map((e) => (e as Record<string, string>)[column]).filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error: profileError } = await client
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,created_at")
    .in("id", ids);

  if (profileError) throw new Error(profileError.message);
  return (data ?? []).map((row) => toProfile(row as ProfileRow));
}

/** Everyone this person follows. */
export function fetchFollowing(userId: string): Promise<Profile[]> {
  return profilesFromFollows("followee_id", "follower_id", userId);
}

/** Everyone following this person. */
export function fetchFollowers(userId: string): Promise<Profile[]> {
  return profilesFromFollows("follower_id", "followee_id", userId);
}

/**
 * Who the signed-in account follows, as a set of ids.
 *
 * Filtered on `follower_id`, and that filter is load-bearing rather than
 * decorative: the `follows` select policy is `using (true)` because the
 * visibility rules need every reader to see the edges. An unfiltered select
 * would therefore return the entire follow graph of every account, and every
 * Follow button on screen would render as already-followed.
 */
export async function fetchFollowedIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseBrowser()
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r as { followee_id: string }).followee_id));
}

/**
 * How many follow this person, and how many they follow.
 *
 * Two head-only counts rather than fetching the edges: the screen prints
 * numbers, and `follows` has a row per relationship, so reading them to call
 * `.length` would grow with the graph for no reason.
 */
export async function fetchFollowCounts(userId: string): Promise<FollowCounts> {
  const client = supabaseBrowser();

  const [followers, following] = await Promise.all([
    client.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", userId),
    client.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
  ]);

  if (followers.error) throw new Error(followers.error.message);
  if (following.error) throw new Error(following.error.message);

  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

/**
 * Updates the parts of your own profile that are yours to write.
 *
 * Only the keys actually passed are sent, so updating a bio cannot blank an
 * avatar. No `id` filter and no user lookup: the update policy already
 * restricts this to your own row, and a client-supplied owner is one a client
 * can get wrong — the same rule the `auth.uid()` defaults follow everywhere
 * else in this schema.
 */
export async function updateProfile(patch: {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}): Promise<void> {
  const row = {
    ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
    ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
    ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : {}),
  };
  if (Object.keys(row).length === 0) return;

  const { error } = await supabaseBrowser().from("profiles").update(row).not("id", "is", null);
  if (error) throw new Error(error.message);
}

/**
 * "Joined on Jan 18, 2025".
 *
 * Fixed to en-US rather than the visitor's locale. Dates in this app are
 * written US-style everywhere else — the release calendar included — and a
 * profile that reads differently depending on who is looking at it is a
 * detail that only ever surfaces as a bug report.
 */
export function joinedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
