"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/lib/useSession";
import { useFollowing } from "@/lib/useFollowing";
import { fetchFollowers, fetchFollowing, searchProfiles } from "@/lib/profile";
import type { Profile } from "@/lib/profile";
import { fetchFollowedPeople, unfollowPerson } from "@/lib/people";
import type { FollowedPerson } from "@/lib/people";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";

const DEBOUNCE_MS = 300;

type Tab = "find" | "following" | "followers" | "people";

const TABS: { id: Tab; label: string }[] = [
  { id: "find", label: "Find people" },
  { id: "following", label: "Following" },
  { id: "followers", label: "Followers" },
  { id: "people", label: "Cast & crew" },
];

/**
 * Finding people, and everyone already followed.
 *
 * Two different kinds of "person" live here on purpose: CineSync accounts,
 * which follow each other through `follows`, and film people — actors,
 * directors, writers — followed through `person_follows`. They are different
 * tables and different notifications, but from the outside they are one
 * question: whose work am I keeping up with.
 */
export function PeoplePanel() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("find");

  if (!user) return null;

  return (
    <section>
      <div className="hide-scrollbar mb-6 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`shrink-0 rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${
              tab === t.id
                ? "bg-primary text-on-primary"
                : "border border-white/10 bg-surface-container/50 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "find" ? <FindPeople selfId={user.id} /> : null}
      {tab === "following" ? <FollowList userId={user.id} which="following" /> : null}
      {tab === "followers" ? <FollowList userId={user.id} which="followers" /> : null}
      {tab === "people" ? <FollowedCastCrew userId={user.id} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Searching accounts
 * ------------------------------------------------------------------ */

function FindPeople({ selfId }: { selfId: string }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  /*
     One piece of state carrying the query it answers, rather than a `results`
     and an `error` cleared whenever the query changes.

     Clearing them would mean calling setState in the effect body, which is a
     cascading render — and the derived read below does the same job for free:
     an outcome whose `q` no longer matches simply is not this query's answer,
     so it renders as "still searching" without anything having to reset it.
  */
  const [outcome, setOutcome] = useState<{ q: string; rows?: Profile[]; error?: string } | null>(
    null,
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) return;
    let cancelled = false;
    void searchProfiles(debounced, selfId)
      .then((rows) => {
        if (!cancelled) setOutcome({ q: debounced, rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOutcome({ q: debounced, error: err instanceof Error ? err.message : "Search failed." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, selfId]);

  const current = outcome?.q === debounced ? outcome : null;
  const results = current?.rows ?? null;
  const error = current?.error ?? null;

  return (
    <div className="glass-panel rounded-lg p-6">
      <label className="sr-only" htmlFor="find-people">
        Search for someone by username
      </label>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
        />
        <input
          id="find-people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username…"
          className="w-full rounded-full border border-white/10 bg-surface-container/60 py-3 pl-12 pr-4 font-body-md text-body-md text-on-surface outline-none ring-primary/60 transition-colors placeholder:text-on-surface-variant focus-visible:border-primary/40 focus-visible:ring-2"
        />
      </div>

      <div className="mt-5">
        {error ? (
          <p className="py-6 text-center font-body-md text-body-md text-error">{error}</p>
        ) : debounced.length < 2 ? (
          <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
            Usernames are how people are found here. Type at least two letters.
          </p>
        ) : results === null ? (
          <p className="pulsing-text py-6 text-center font-label-md text-label-md text-on-surface-variant">
            Searching…
          </p>
        ) : results.length === 0 ? (
          <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
            Nobody here goes by &ldquo;{debounced}&rdquo;.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((p) => (
              <li key={p.id}>
                <PersonRow profile={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Follow lists
 * ------------------------------------------------------------------ */

function FollowList({ userId, which }: { userId: string; which: "following" | "followers" }) {
  const [rows, setRows] = useState<Profile[] | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    const read = which === "following" ? fetchFollowing : fetchFollowers;
    void read(userId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, which]);

  useEffect(load, [load]);

  return (
    <div className="glass-panel rounded-lg p-6">
      {rows === null ? (
        <p className="pulsing-text py-6 text-center font-label-md text-label-md text-on-surface-variant">
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
          {which === "following"
            ? "You don't follow anyone yet. Find people by username above."
            : "Nobody follows you yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id}>
              <PersonRow profile={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonRow({ profile }: { profile: Profile }) {
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const { isFollowing, toggle, pending } = useFollowing();
  const following = isFollowing(profile.id);

  /*
     The row opens them, the button follows them.

     Every row here — a search result, someone you follow, someone who follows
     you — was a name with a Follow button and no way to see whose name it was.
     The row is the way in now; the button stops the click before it gets
     there, so following someone doesn't also open them.
  */
  return (
    <div
      onClick={() => openUserProfile(profile.id)}
      role="button"
      tabIndex={0}
      aria-label={`Open ${profile.displayName || profile.username}'s profile`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openUserProfile(profile.id);
        }
      }}
      className="glass-card flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-white/5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="account_circle" fill className="text-[30px] text-primary" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-body-lg text-body-lg font-semibold text-on-surface">
          {profile.displayName || profile.username}
        </p>
        <p className="truncate font-label-md text-label-md text-on-surface-variant">
          @{profile.username}
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void toggle(profile.id);
        }}
        disabled={pending === profile.id}
        aria-pressed={following}
        className={`shrink-0 rounded-full px-4 py-2 font-label-md text-label-md transition-colors disabled:opacity-60 ${
          following
            ? "bg-surface-container text-on-surface-variant hover:bg-error/20 hover:text-error"
            : "bg-primary text-on-primary hover:bg-primary-fixed"
        }`}
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Followed cast & crew
 * ------------------------------------------------------------------ */

function FollowedCastCrew({ userId }: { userId: string }) {
  const openPerson = useAppStore((s) => s.openPerson);
  const showToast = useAppStore((s) => s.showToast);
  const [people, setPeople] = useState<FollowedPerson[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFollowedPeople(userId)
      .then((p) => {
        if (!cancelled) setPeople(p);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const drop = async (person: FollowedPerson) => {
    const before = people ?? [];
    setPeople(before.filter((p) => p.personTmdbId !== person.personTmdbId));
    try {
      await unfollowPerson(person.personTmdbId);
    } catch (err) {
      setPeople(before);
      showToast(err instanceof Error ? err.message : "That didn't save.");
    }
  };

  return (
    <div className="glass-panel rounded-lg p-6">
      {people === null ? (
        <p className="pulsing-text py-6 text-center font-label-md text-label-md text-on-surface-variant">
          Loading…
        </p>
      ) : people.length === 0 ? (
        <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
          You don&rsquo;t follow any cast or crew yet. Open anyone from a film&rsquo;s credits and
          press Follow — you&rsquo;ll be told when they announce something new.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {people.map((p) => (
            <motion.li
              key={p.personTmdbId}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card group relative flex items-center gap-3 rounded-lg p-3"
            >
              <button
                type="button"
                onClick={() => openPerson(p.personTmdbId)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high">
                  {p.profile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.profile} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="person" className="text-[24px] text-on-surface-variant" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-body-md text-[14px] font-semibold text-on-surface">
                    {p.name}
                  </span>
                  <span className="block truncate font-label-md text-[12px] text-on-surface-variant">
                    {p.department ?? "Film"}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => void drop(p)}
                aria-label={`Unfollow ${p.name}`}
                title={`Unfollow ${p.name}`}
                className="shrink-0 rounded-full p-2 text-on-surface-variant opacity-0 transition-all hover:bg-error/20 hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Icon name="person_remove" className="text-[18px]" />
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
