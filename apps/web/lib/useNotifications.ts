"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";
import { fetchFollowedPeople, rememberAnnounced } from "./people";
import {
  clearNotifications,
  fetchNotifications,
  markAllRead,
  recordReleaseAlerts,
} from "./notifications";
import type { AppNotification, ReleaseAlert } from "./notifications";
import type { Person } from "./types";
import { playNotificationCue } from "./notificationCue";
import { useAppStore } from "@/store/useAppStore";
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

/**
 * How often the bell looks again while the tab is in front.
 *
 * A follow notification is written by a database trigger — see
 * `notify_on_follow` in 0006 — so nothing on this client knows it happened.
 * Loading once per page load meant the only way to see that someone had
 * followed you was to reload the page.
 *
 * Polling rather than Supabase Realtime: `notifications` is not in the
 * `supabase_realtime` publication, and adding it is a migration run by hand
 * against production for a table whose rows arrive minutes apart. The wake-ups
 * below make the common case immediate anyway — coming back to the tab is what
 * someone does between following and looking.
 */
const POLL_MS = 45_000;

/**
 * The listeners and the timer that keep the bell current, at most one set.
 *
 * Keyed by user id rather than reference counted: `useNotifications` is used
 * by both the nav bell and the panel under it, and the two mount and unmount
 * independently. Keying means the second consumer re-uses the first's timer
 * instead of adding one of its own.
 */
let live: { userId: string; stop: () => void } | null = null;

function startLive(userId: string): void {
  if (live?.userId === userId) return;
  live?.stop();

  // A hidden tab is throttled by the browser anyway, and re-reading for
  // someone who isn't looking is a request nobody asked for.
  const wake = () => {
    if (document.visibilityState === "visible") void load(userId);
  };

  const timer = setInterval(wake, POLL_MS);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);

  live = {
    userId,
    stop() {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    },
  };
}

function stopLive(): void {
  live?.stop();
  live = null;
}

const subscribers = new Set<() => void>();
function publish() {
  for (const fn of subscribers) fn();
}

/**
 * Notices what the last read did not contain.
 *
 * The bell only ever grew a number. Someone had to open the panel to find out
 * that anything had happened, which for the one notification this app sends
 * unprompted — somebody followed you — meant nobody found out at all until
 * they went looking.
 *
 * Ids rather than a count: a count goes up and down as things are read and
 * cleared, and would announce the same follow twice the first time an older
 * notification was deleted. `seen` is only ever added to.
 *
 * Keyed by whose notifications they are, rather than emptied on sign-out.
 * Emptying was the first version and it never announced anything: the hook
 * runs in two components, each reads the session for itself, and each one
 * renders once with no user before that resolves — so the sign-out branch
 * fired on a perfectly normal load and wiped the set between the read that
 * filled it and the next one. Keyed, a stale set can only be one user's own,
 * and the id it is compared against is the one being read for.
 */
let seenFor: string | null = null;
let seen = new Set<string>();

function announceNew(userId: string, next: AppNotification[]): void {
  /*
     The first read for an account teaches this what already exists rather than
     announcing it. Otherwise every reload would replay whatever was unread as
     though it had just happened.
  */
  if (seenFor !== userId) {
    seen = new Set(next.map((n) => n.id));
    seenFor = userId;
    return;
  }

  const arrivals = next.filter((n) => !seen.has(n.id) && !n.read);
  for (const n of next) seen.add(n.id);

  if (arrivals.length === 0) return;

  /*
     The newest one, not all of them. `fetchNotifications` returns newest
     first, and three cards stacking up from one poll is a worse way to learn
     that three things happened than one card and a bell reading 3.
  */
  useAppStore.getState().announceArrival(arrivals[0]);
  void playNotificationCue();
}

async function load(userId: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const next = await fetchNotifications();
      announceNew(userId, next);
      items = next;
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

  /*
     Announced once, and remembered as announced.

     Without this the baseline still reads as it did the day the person was
     followed, so a cleared release notification is re-created by the very next
     load — the row was the only thing keeping it away. Folding the announced
     ids into the baseline is what makes "clear" stick.

     Written whether or not the insert added a row: an alert the unique index
     skipped is one that has already been announced, which is exactly the case
     this is here to stop repeating.
  */
  await Promise.all(
    people.map(async (person) => {
      const mine = alerts
        .filter((a) => a.personTmdbId === person.personTmdbId)
        .map((a) => a.titleTmdbId);
      if (mine.length === 0) return;
      // A baseline that fails to widen costs one repeat, not a broken bell.
      await rememberAnnounced(person.personTmdbId, person.baseline, mine).catch(() => {});
    }),
  );

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
      /*
         Only when there was somebody to sign out.

         `useSession` starts every consumer at `user: null` and fills it in
         when the session read comes back, so this branch runs once per mount
         on a perfectly ordinary load. Left unguarded it cleared `loadedFor`
         and made the next render re-fetch the whole list — and it used to
         clear the seen-ids set too, which is why nothing was ever announced.
         Before the first load there is nothing to tear down.
      */
      if (loadedFor === null) return;

      items = [];
      loadedFor = null;
      checkedFor = null;
      stopLive();
      publish();
      return;
    }

    startLive(user.id);

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

  /**
   * Reads the list again now.
   *
   * The bell calls this when it is opened: someone pressing it is the clearest
   * signal there is that they want to know, and it costs one query.
   */
  const refresh = useCallback(async () => {
    if (!user) return;
    await load(user.id);
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
    refresh,
    markRead,
    clear,
  };
}
