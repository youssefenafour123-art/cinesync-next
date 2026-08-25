"use client";

import { useEffect, useState } from "react";
import { useSession } from "./useSession";
import { fetchProfile } from "./profile";
import type { Profile } from "./profile";

/**
 * The signed-in user's own profile row, held once for the whole app.
 *
 * Module scope for the same reason as `useWatchlist` and `useLists`: the top
 * nav shows your picture and the profile screen shows the same picture, and
 * two copies would mean uploading a new one changed it in one place and left
 * the other showing the old one until a reload.
 *
 * Only ever your own. Someone else's profile is fetched directly with
 * `fetchProfile`, because there is one of you and any number of them.
 */
let profile: Profile | null = null;
let loadedFor: string | null = null;
let inFlight: Promise<void> | null = null;

const subscribers = new Set<() => void>();
function publish() {
  for (const fn of subscribers) fn();
}

async function load(userId: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      profile = await fetchProfile(userId);
    } catch {
      // A profile that cannot be read leaves the fallback glyph in place,
      // which is the safe way to be wrong: nothing claims to be a picture.
      profile = null;
    } finally {
      loadedFor = userId;
      inFlight = null;
      publish();
    }
  })();
  return inFlight;
}

/** Replaces the held row — used after an edit, so both readers update at once. */
export function setMyProfile(next: Profile | null): void {
  profile = next;
  publish();
}

/** Patches one part of it, leaving the rest alone. */
export function patchMyProfile(patch: Partial<Profile>): void {
  if (!profile) return;
  profile = { ...profile, ...patch };
  publish();
}

export function useMyProfile() {
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
      // A different account has a different picture, and signing out should
      // not leave the previous one in the nav.
      profile = null;
      loadedFor = null;
      publish();
      return;
    }
    if (loadedFor !== user.id) void load(user.id);
  }, [user]);

  return { profile, ready: user ? loadedFor === user.id : false };
}
