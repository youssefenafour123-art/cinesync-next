"use client";

import { supabaseBrowser } from "./supabase/client";
import type { MediaKind } from "./types";

export type NotificationKind = "follow" | "release";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  createdAt: string;
  read: boolean;

  /** 'follow' — who did it. */
  actorId?: string;
  actorUsername?: string;

  /** 'release' — whose project, and which. */
  personTmdbId?: number;
  personName?: string;
  title?: string;
  titleTmdbId?: number;
  titleKind?: MediaKind;
  poster?: string;
  releaseDate?: string;
}

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
  actor_username: string | null;
  person_tmdb_id: number | null;
  person_name: string | null;
  title: string | null;
  title_tmdb_id: number | null;
  title_kind: MediaKind | null;
  poster: string | null;
  release_date: string | null;
}

const COLUMNS =
  "id,kind,created_at,read_at,actor_id,actor_username,person_tmdb_id,person_name,title,title_tmdb_id,title_kind,poster,release_date";

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    read: row.read_at !== null,
    actorId: row.actor_id ?? undefined,
    actorUsername: row.actor_username ?? undefined,
    personTmdbId: row.person_tmdb_id ?? undefined,
    personName: row.person_name ?? undefined,
    title: row.title ?? undefined,
    titleTmdbId: row.title_tmdb_id ?? undefined,
    titleKind: row.title_kind ?? undefined,
    poster: row.poster ?? undefined,
    releaseDate: row.release_date ?? undefined,
  };
}

/**
 * The bell's contents.
 *
 * No owner filter is needed and none is possible to get wrong: unlike every
 * other table in this schema, `notifications` has no public read at all — the
 * select policy is `auth.uid() = user_id`, because a notification is addressed
 * to exactly one person by definition.
 */
export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabaseBrowser()
    .from("notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toNotification(row as NotificationRow));
}

/** Marks everything currently unread as read. */
export async function markAllRead(): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw new Error(error.message);
}

export async function clearNotifications(): Promise<void> {
  // A delete needs a filter; the policy restricts it to your own rows anyway.
  const { error } = await supabaseBrowser().from("notifications").delete().not("id", "is", null);
  if (error) throw new Error(error.message);
}

export interface ReleaseAlert {
  personTmdbId: number;
  personName: string;
  title: string;
  titleTmdbId: number;
  titleKind: MediaKind;
  poster?: string;
  releaseDate?: string;
}

/**
 * Records newly announced work by people you follow.
 *
 * Written by the client because there is no background job on this project to
 * notice that TMDB announced something — the release check runs when the app
 * loads. The policy makes that safe by pinning the recipient to the caller:
 * the worst anyone can do with this is spam themselves.
 *
 * `ignoreDuplicates` leans on the unique index over
 * (user_id, person_tmdb_id, title_tmdb_id): the check runs on every load, so
 * without it the same film would be announced again every time, and two tabs
 * racing would announce it twice.
 */
export async function recordReleaseAlerts(userId: string, alerts: ReleaseAlert[]): Promise<number> {
  if (alerts.length === 0) return 0;

  const { data, error } = await supabaseBrowser()
    .from("notifications")
    .upsert(
      alerts.map((a) => ({
        user_id: userId,
        kind: "release" as const,
        person_tmdb_id: a.personTmdbId,
        person_name: a.personName,
        title: a.title,
        title_tmdb_id: a.titleTmdbId,
        title_kind: a.titleKind,
        poster: a.poster ?? null,
        release_date: a.releaseDate ?? null,
      })),
      { onConflict: "user_id,person_tmdb_id,title_tmdb_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
