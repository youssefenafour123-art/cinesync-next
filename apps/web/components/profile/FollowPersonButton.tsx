"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { useAppStore } from "@/store/useAppStore";
import { fetchFollowedPeople, followPerson, unfollowPerson } from "@/lib/people";
import type { Person } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

/**
 * Follow an actor, director or writer.
 *
 * What following them buys is a notification when they announce something —
 * so the button says that rather than just "Follow", because a follow with no
 * visible consequence reads as decoration.
 *
 * Hidden when signed out, like every other account-shaped control in the app.
 */
export function FollowPersonButton({ person }: { person: Person }) {
  const { user } = useSession();
  const showToast = useAppStore((s) => s.showToast);
  /*
     The answer carries who and what it is about, rather than being cleared
     whenever either changes. Clearing would be a setState in the effect body —
     a cascading render — and a stale answer is impossible anyway once the read
     below requires the key to match.
  */
  const [answer, setAnswer] = useState<{ userId: string; personId: number; following: boolean }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const userId = user.id;
    void fetchFollowedPeople(userId)
      .then((people) => {
        if (cancelled) return;
        setAnswer({
          userId,
          personId: person.tmdbId,
          following: people.some((p) => p.personTmdbId === person.tmdbId),
        });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ userId, personId: person.tmdbId, following: false });
      });
    return () => {
      cancelled = true;
    };
  }, [user, person.tmdbId]);

  if (!user) return null;

  const following =
    answer && answer.userId === user.id && answer.personId === person.tmdbId
      ? answer.following
      : null;

  const toggle = async () => {
    if (busy || following === null) return;
    const next = !following;
    setAnswer({ userId: user.id, personId: person.tmdbId, following: next });
    setBusy(true);

    try {
      if (next) {
        /*
           The baseline goes in with the follow, taken from the credits already
           on screen — so this costs no extra request, and everything TMDB
           lists for them right now counts as already-known rather than as news
           the moment you press the button.
        */
        await followPerson({
          tmdbId: person.tmdbId,
          name: person.name,
          profile: person.profile,
          department: person.department,
          upcoming: person.upcoming ?? [],
        });
        showToast(`Following ${person.name}. You'll hear about new projects.`);
      } else {
        await unfollowPerson(person.tmdbId);
      }
    } catch (err) {
      setAnswer({ userId: user.id, personId: person.tmdbId, following: !next });
      showToast(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  };

  // Nothing at all until the answer is known, rather than a button that says
  // "Follow" and flips a moment later on someone already followed.
  if (following === null) return <span className="block h-10" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={following}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-label-md text-label-md transition-colors disabled:opacity-60 ${
        following
          ? "border border-primary/30 bg-primary/10 text-primary hover:border-error/40 hover:bg-error/10 hover:text-error"
          : "bg-primary text-on-primary hover:bg-primary-fixed"
      }`}
    >
      <Icon
        name={following ? "notifications_active" : "person_add"}
        fill={following}
        className="text-[18px]"
      />
      {following ? "Following their work" : "Follow for new projects"}
    </button>
  );
}
