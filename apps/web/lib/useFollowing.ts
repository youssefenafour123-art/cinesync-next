"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";
import { useAppStore } from "@/store/useAppStore";
import { follow, unfollow } from "./lists";
import { fetchFollowedIds } from "./profile";

/**
 * Who the signed-in account follows, held once for the whole app.
 *
 * Module scope for the reason every store here is: the same person can appear
 * in a search result, in a followers list and on their own profile at the same
 * moment, and three Follow buttons disagreeing about whether you follow them
 * is the state this prevents.
 */
let followed = new Set<string>();
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
      followed = await fetchFollowedIds(userId);
    } catch {
      // An unreadable graph shows every button as "Follow", which is the safe
      // way to be wrong: pressing it again is harmless, since the insert is
      // idempotent on the primary key.
      followed = new Set();
    } finally {
      loadedFor = userId;
      inFlight = null;
      publish();
    }
  })();
  return inFlight;
}

export function useFollowing() {
  const { user } = useSession();
  const showToast = useAppStore((s) => s.showToast);
  const [, force] = useState(0);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      followed = new Set();
      loadedFor = null;
      publish();
      return;
    }
    if (loadedFor !== user.id) void load(user.id);
  }, [user]);

  const isFollowing = useCallback((userId: string) => followed.has(userId), []);

  const toggle = useCallback(
    async (userId: string): Promise<void> => {
      if (!user) {
        showToast("Sign in to follow people.");
        return;
      }
      if (userId === user.id) return;

      const following = followed.has(userId);

      // Optimistic, and put back if the write is refused. A follow is one row
      // in one table, so the responsive choice is the honest one.
      const next = new Set(followed);
      if (following) next.delete(userId);
      else next.add(userId);
      followed = next;
      publish();
      setPending(userId);

      try {
        if (following) await unfollow(userId);
        else await follow(userId);
      } catch (err) {
        const revert = new Set(followed);
        if (following) revert.add(userId);
        else revert.delete(userId);
        followed = revert;
        publish();
        showToast(err instanceof Error ? err.message : "That didn't save.");
      } finally {
        setPending(null);
      }
    },
    [user, showToast],
  );

  return {
    isFollowing,
    toggle,
    pending,
    count: followed.size,
    ready: user ? loadedFor === user.id : false,
    signedIn: Boolean(user),
  };
}
