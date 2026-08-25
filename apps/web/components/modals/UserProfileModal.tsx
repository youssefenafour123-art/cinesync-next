"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/lib/useSession";
import { useFollowing } from "@/lib/useFollowing";
import { useAppStore } from "@/store/useAppStore";
import { fetchFollowCounts, fetchProfile, joinedOn } from "@/lib/profile";
import type { FollowCounts, Profile } from "@/lib/profile";
import { fetchListItems, fetchListsVisibleTo } from "@/lib/lists";
import type { ListSummary, SavedTitle } from "@/lib/lists";
import { TopFive } from "@/components/ui/TopFive";
import { SavedTitleGrid, SavedTitleGridSkeleton } from "@/components/ui/SavedTitleGrid";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "./ModalShell";

/**
 * Somebody else's profile.
 *
 * Everything on it is read under the same policies that decide what anyone may
 * see: `profiles` and `favorites` are readable by everyone — which is what
 * makes a username worth having — and `lists` come back filtered by
 * `can_view`, so a private list is not hidden by this component, it never
 * arrives. There is nothing here that asks whether the reader is allowed to
 * look; the database has already answered.
 *
 * A modal rather than a screen, because it is reached from a row in a list —
 * the People panel, a follow notification — and those are places you glance at
 * someone from and come back to, not places you navigate away from.
 */
export function UserProfileModal({ userId }: { userId: string }) {
  const close = useAppStore((s) => s.closeUserProfile);
  const { user } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [counts, setCounts] = useState<FollowCounts | null>(null);

  /*
     Nothing is reset here on the way in, and nothing needs to be: `page.tsx`
     keys this modal by the user id, so arriving at a different profile mounts
     a different component with fresh state. Clearing it in the effect body
     would be a setState in a render pass, which is the cascading render the
     People panel's search was written to avoid.
  */
  useEffect(() => {
    let cancelled = false;

    void fetchProfile(userId)
      .then((row) => {
        if (cancelled) return;
        setProfile(row);
        setState(row ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });

    void fetchFollowCounts(userId)
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const self = user?.id === userId;

  return (
    <ModalShell
      onClose={close}
      label={profile ? `Profile for ${profile.username}` : "Profile"}
      className="glass-panel panel-glow max-w-4xl rounded-xl"
    >
      {state === "loading" ? (
        <LoadingState label="Loading profile…" />
      ) : !profile ? (
        <ErrorState message="That profile couldn't be found." />
      ) : (
        <div className="custom-scrollbar overflow-y-auto p-6 md:p-10">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high">
              {profile.avatarUrl ? (
                // A plain img, not PosterImage: that component's failure
                // fallback is a film reel, which is the wrong picture for a
                // person.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={profile.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Icon name="account_circle" fill className="text-[56px] text-primary" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="truncate font-headline-lg text-[26px] text-on-surface">
                {profile.displayName || profile.username}
              </h2>
              <p className="font-label-md text-label-md text-primary">@{profile.username}</p>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                Joined on {joinedOn(profile.createdAt)}
              </p>

              <div className="mt-2 flex items-center gap-5 font-label-md text-label-md text-on-surface-variant">
                <span>
                  <span className="text-on-surface">{counts?.followers ?? 0}</span>{" "}
                  {counts?.followers === 1 ? "follower" : "followers"}
                </span>
                <span>
                  <span className="text-on-surface">{counts?.following ?? 0}</span> following
                </span>
              </div>
            </div>

            {/* Not offered on your own profile — the follow policies refuse it,
                and a Follow button pointing at yourself is a question nobody
                meant to ask. */}
            {self ? null : <FollowButton userId={userId} />}
          </header>

          {profile.bio ? (
            <p className="mt-5 max-w-prose font-body-md text-body-md text-on-surface-variant">
              {profile.bio}
            </p>
          ) : null}

          <section className="mt-8">
            <h3 className="mb-4 font-title-lg text-title-lg text-on-surface">Top Fives</h3>
            {/* The same component the owner edits, in the mode that only
                displays — passing a user id is what tells it whose these are. */}
            <TopFive userId={userId} />
          </section>

          <VisibleLists userId={userId} self={self} />
        </div>
      )}
    </ModalShell>
  );
}

function FollowButton({ userId }: { userId: string }) {
  const { isFollowing, toggle, pending } = useFollowing();
  const following = isFollowing(userId);

  return (
    <button
      type="button"
      onClick={() => void toggle(userId)}
      disabled={pending === userId}
      aria-pressed={following}
      className={`shrink-0 self-start rounded-full px-5 py-2.5 font-label-md text-label-md transition-colors disabled:opacity-60 ${
        following
          ? "bg-surface-container text-on-surface-variant hover:bg-error/20 hover:text-error"
          : "bg-primary text-on-primary hover:bg-primary-fixed"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

/**
 * Their lists, as far as the reader is allowed in.
 *
 * The count of lists is not shown when there are none, because "0 lists" is
 * ambiguous here in a way it is not on your own profile: it could mean they
 * have made none, or that every one of them is private. Saying nothing is the
 * honest version of an answer this client cannot know.
 */
function VisibleLists({ userId, self }: { userId: string; self: boolean }) {
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchListsVisibleTo(userId)
      .then((rows) => {
        if (!cancelled) setLists(rows);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (lists !== null && lists.length === 0) return null;

  return (
    <section className="mt-8">
      <h3 className="mb-4 font-title-lg text-title-lg text-on-surface">
        {self ? "Your lists" : "Lists"}
      </h3>

      {lists === null ? (
        <div className="h-[76px] animate-pulse rounded-lg bg-surface-container" />
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <VisibleList
              key={list.id}
              list={list}
              open={openId === list.id}
              onToggle={() => setOpenId((id) => (id === list.id ? null : list.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function VisibleList({
  list,
  open,
  onToggle,
}: {
  list: ListSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const [items, setItems] = useState<SavedTitle[] | null>(null);

  // Fetched when the row is first opened, like the owner's own list rows: a
  // profile with six lists should not cost six requests to render six counts
  // the aggregate already carried.
  useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;
    void fetchListItems(list.id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, items, list.id]);

  const icon = list.isWatchlist ? "bookmark" : list.isWatched ? "visibility" : "list";

  return (
    <div className="glass-card overflow-hidden rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left md:p-5"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
          <Icon name={icon} className="text-[22px] text-primary" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-body-lg text-body-lg font-semibold text-on-surface">
            {list.name}
          </span>
          <span className="mt-1 block font-label-md text-label-md text-on-surface-variant">
            {list.itemCount} {list.itemCount === 1 ? "title" : "titles"}
          </span>
        </span>
        <Icon
          name="expand_more"
          className={`ml-auto shrink-0 text-on-surface-variant transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="border-t border-white/10 p-4 md:p-5">
            {items === null ? (
              <SavedTitleGridSkeleton />
            ) : items.length === 0 ? (
              <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
                Nothing in this list yet.
              </p>
            ) : (
              /* No `onRemove`: this is somebody else's shelf. The grid drops
                 the control entirely when it isn't given one. */
              <SavedTitleGrid items={items} />
            )}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
