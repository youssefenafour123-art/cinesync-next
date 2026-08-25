"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";
import { fetchFollowedPeople } from "./people";
import {
  clearNotifications,
  fetchNotifications,
  markAllRead,
  recordReleaseAlerts,
} from "./notifications";
import type { AppNotification, ReleaseAlert } from "./notifications";
import type { Person } from "./types";
import { endpoints } from "@cinesync/shared/api";

/**
 * The bell's contents, held once for the whole app.
 *
 * Module scope like every other store here: the unread badge in the nav and
 * the open panel under it are the same list, and a second copy would let the
 * badge keep a count the panel has already cleared.
 */
let items: AppNotification[] = [];
let loadedFor: string | null = null;
let inFlight: Promise<void> | null = null;

/**
 * Whose releases have already been checked this page load.
 *
 * Once per load, not on an interval. The check costs one request per followed
 * person, `/api/person` is cached for a day upstream, and TMDB does not
 * announce films often enough for a second look in the same sitting to find
 * anything.
 */
let checkedFor: string | null = null;

const subscribers = new Set<() => void>();
function publish() {
  for (const fn of subscribers) fn();
}

async function load(userId: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      items = await fetchNotifications();
    } catch {
      // An unreadable list is an empty bell, not an error banner. Nothing here
      // is worth interrupting someone who came to browse films.
      items = [];
    } finally {
      loadedFor = userId;
      inFlight = null;
      publish();
    }
  })();
  return inFlight;
}

/**
 * Looks for work announced since each person was followed.
 *
 * `person_follows.baseline_tmdb_ids` is what they already had announced at the
 * moment they were followed, so anything in `upcoming` that is not in the
 * baseline appeared afterwards. That is the whole definition of "new" here,
 * and it is why following someone with two dozen announced projects is silent
 * rather than an avalanche.
 *
 * Failures are swallowed per person: one unreachable profile should not stop
 * the others being checked.
 */
async function checkReleases(userId: string): Promise<void> {
  const people = await fetchFollowedPeople(userId).catch(() => []);
  if (people.length === 0) return;

  const alerts: ReleaseAlert[] = [];

  await Promise.all(
    people.map(async (person) => {
      try {
        const res = await fetch(endpoints.person(person.personTmdbId));
        if (!res.ok) return;
        const data = (await res.json()) as Person;

        const known = new Set(person.baseline);
        for (const credit of data.upcoming ?? []) {
          if (known.has(credit.tmdbId)) continue;
          alerts.push({
            personTmdbId: person.personTmdbId,
            personName: person.name,
            title: credit.title,
            titleTmdbId: credit.tmdbId,
            titleKind: credit.kind,
            poster: credit.poster,
            releaseDate: credit.releaseDate,
          });
        }
      } catch {
        // Nothing to do about one person's profile failing to load.
      }
    }),
  );

  if (alerts.length === 0) return;
  const added = await recordReleaseAlerts(userId, alerts).catch(() => 0);
  if (added > 0) await load(userId);
}

export function useNotifications() {
  const { user } = useSession();
  const [, force] = useState(0);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      items = [];
      loadedFor = null;
      checkedFor = null;
      publish();
      return;
    }

    if (loadedFor !== user.id) {
      void load(user.id).then(() => {
        // After the list is on screen, not before it: the check can take a
        // moment per followed person, and the bell should not wait on it.
        if (checkedFor === user.id) return;
        checkedFor = user.id;
        void checkReleases(user.id);
      });
    }
  }, [user]);

  const markRead = useCallback(async () => {
    if (!items.some((n) => !n.read)) return;

    const before = items;
    const at = new Date().toISOString();
    items = items.map((n) => (n.read ? n : { ...n, read: true, readAt: at }));
    publish();

    try {
      await markAllRead();
    } catch {
      items = before;
      publish();
    }
  }, []);

  const clear = useCallback(async () => {
    const before = items;
    items = [];
    publish();
    try {
      await clearNotifications();
    } catch {
      items = before;
      publish();
    }
  }, []);

  return {
    items,
    unread: items.filter((n) => !n.read).length,
    ready: user ? loadedFor === user.id : false,
    signedIn: Boolean(user),
    markRead,
    clear,
  };
}
