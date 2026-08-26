"use client";

import { supabaseBrowser } from "./supabase/client";
import type { PersonCredit } from "./types";

/** A followed person — an actor, director or writer, not a CineSync account. */
export interface FollowedPerson {
  personTmdbId: number;
  name: string;
  profile?: string;
  department?: string;
  /** What they already had announced when they were followed. */
  baseline: number[];
}

interface PersonFollowRow {
  person_tmdb_id: number;
  name: string;
  profile: string | null;
  department: string | null;
  baseline_tmdb_ids: number[] | null;
}

function toFollowedPerson(row: PersonFollowRow): FollowedPerson {
  return {
    personTmdbId: row.person_tmdb_id,
    name: row.name,
    profile: row.profile ?? undefined,
    department: row.department ?? undefined,
    baseline: row.baseline_tmdb_ids ?? [],
  };
}

/**
 * The people this account follows.
 *
 * Owner-filtered rather than relying on the policy: `person_follows` is
 * readable by everyone — it is part of a profile — so an unfiltered select
 * returns everybody's, the same trap `fetchFollowedIds` documents.
 */
export async function fetchFollowedPeople(userId: string): Promise<FollowedPerson[]> {
  const { data, error } = await supabaseBrowser()
    .from("person_follows")
    .select("person_tmdb_id,name,profile,department,baseline_tmdb_ids")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toFollowedPerson(row as PersonFollowRow));
}

/**
 * Follows a person, recording what they already had announced.
 *
 * The baseline is taken from the credits the caller is already showing, so
 * this costs no extra request — and without it, following someone with two
 * dozen announced projects would announce all two dozen as news.
 */
export async function followPerson(person: {
  tmdbId: number;
  name: string;
  profile?: string;
  department?: string;
  upcoming: PersonCredit[];
}): Promise<void> {
  const { error } = await supabaseBrowser().from("person_follows").upsert(
    {
      person_tmdb_id: person.tmdbId,
      name: person.name,
      profile: person.profile ?? null,
      department: person.department ?? null,
      baseline_tmdb_ids: person.upcoming.map((c) => c.tmdbId),
    },
    { onConflict: "user_id,person_tmdb_id" },
  );

  if (error) throw new Error(error.message);
}

/**
 * Folds titles that have already been announced into a person's baseline.
 *
 * The baseline is "what they had announced when you followed them", and the
 * release check calls anything outside it new. That worked only while the
 * notification row itself survived: `recordReleaseAlerts` dedupes on the unique
 * index over (user_id, person_tmdb_id, title_tmdb_id), so the row existing is
 * what stopped a second announcement. Clearing the bell deletes the row — and
 * the next page load announced the same film again, for ever. Reported as a
 * notification that comes back however often it is cleared.
 *
 * Announced is the same kind of fact as already-announced-when-followed, so it
 * belongs in the same place. Once a title is in here the check stops calling it
 * new, whatever happens to the notification.
 *
 * Read-modify-write rather than a Postgres array append, which would need a
 * function and a migration for a column only its owner may write. Two tabs
 * racing both write supersets of the same set, so the loser costs one repeat
 * announcement at worst.
 */
export async function rememberAnnounced(
  personTmdbId: number,
  baseline: number[],
  announced: number[],
): Promise<void> {
  const merged = [...new Set([...baseline, ...announced])];
  if (merged.length === baseline.length) return;

  const { error } = await supabaseBrowser()
    .from("person_follows")
    .update({ baseline_tmdb_ids: merged })
    .eq("person_tmdb_id", personTmdbId);

  if (error) throw new Error(error.message);
}

export async function unfollowPerson(personTmdbId: number): Promise<void> {
  // No user filter: the policy already restricts deletes to your own rows.
  const { error } = await supabaseBrowser()
    .from("person_follows")
    .delete()
    .eq("person_tmdb_id", personTmdbId);

  if (error) throw new Error(error.message);
}
