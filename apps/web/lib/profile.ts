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

/** Updates the parts of your own profile that are yours to write. */
export async function updateProfile(patch: {
  displayName?: string | null;
  bio?: string | null;
}): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("profiles")
    // No `id` filter: the update policy already restricts this to your own row,
    // and a client-supplied id is one a client can get wrong.
    .update({
      ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
    })
    .eq("id", (await supabaseBrowser().auth.getUser()).data.user?.id ?? "");

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
