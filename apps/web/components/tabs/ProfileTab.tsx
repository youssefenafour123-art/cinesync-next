"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/lib/useSession";
import { useWatchlist } from "@/lib/useWatchlist";
import { useWatched } from "@/lib/useWatched";
import { useLists } from "@/lib/useLists";
import { useAppStore } from "@/store/useAppStore";
import { useSourcesStore } from "@/store/useSourcesStore";
import { fetchFollowCounts, joinedOn, updateProfile } from "@/lib/profile";
import { patchMyProfile, useMyProfile } from "@/lib/useMyProfile";
import { uploadAvatar } from "@/lib/avatar";
import type { FollowCounts } from "@/lib/profile";
import {
  ListsSection,
  WatchedSection,
  WatchlistSection,
} from "@/components/library/SavedSections";
import { PeoplePanel } from "@/components/profile/PeoplePanel";
import { WatchTimeCard } from "@/components/profile/WatchTimeCard";
import { SavedTitleGrid } from "@/components/ui/SavedTitleGrid";
import { TopFive } from "@/components/ui/TopFive";
import { CountUp } from "@/components/ui/CountUp";
import { Icon } from "@/components/ui/Icon";

const VIEWS = [
  { id: "profile", label: "Profile" },
  { id: "people", label: "People" },
  { id: "lists", label: "Lists" },
  { id: "watchlist", label: "Watchlist" },
  { id: "watched", label: "Watched" },
] as const;

type View = (typeof VIEWS)[number]["id"];

/**
 * The account's own profile.
 *
 * Reached from the account icon rather than the top nav — the nav row is
 * already eight destinations wide and this is one person's screen, not another
 * catalogue.
 *
 * Only the sub-tabs with something behind them exist. The shape this is
 * modelled on carries nine — reviews, a diary, ratings, watch time — and
 * CineSync has never recorded any of that. Six inert tabs is the decoration
 * the Settings rebuild removed, not a roadmap.
 */
export function ProfileTab() {
  const { user, username, ready } = useSession();
  const setAuthOpen = useAppStore((s) => s.setAuthOpen);
  const [view, setView] = useState<View>("profile");

  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
        <div className="rounded-lg border border-dashed border-white/10 px-6 py-16 text-center">
          <Icon name="account_circle" className="text-4xl text-on-surface-variant opacity-60" />
          <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
            Sign in to have a profile.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="mt-5 rounded-full bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <ProfileHeader userId={user.id} fallbackUsername={username} />

      {/* ---- Sub-tabs ---- */}
      <nav className="hide-scrollbar mb-8 flex gap-2 overflow-x-auto border-b border-white/10">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-current={view === v.id ? "page" : undefined}
            className={`relative shrink-0 px-4 py-3 font-label-md text-label-md transition-colors ${
              view === v.id ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {v.label}
            {/*
               One underline that travels, rather than one per tab fading in
               and out. `layoutId` hands the move to Framer's shared-layout
               animation, so it slides between tabs at whatever width the label
               needs instead of jumping.
            */}
            {view === v.id ? (
              <motion.span
                layoutId="profile-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary shadow-[0_0_12px_rgba(78,222,163,0.7)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
          </button>
        ))}
      </nav>

      {view === "profile" ? <Overview onOpenView={setView} /> : null}
      {view === "people" ? <PeoplePanel /> : null}
      {view === "lists" ? <ListsSection /> : null}
      {view === "watchlist" ? <WatchlistSection /> : null}
      {view === "watched" ? <WatchedSection /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function ProfileHeader({
  userId,
  fallbackUsername,
}: {
  userId: string;
  fallbackUsername: string | null;
}) {
  const setAuthOpen = useAppStore((s) => s.setAuthOpen);
  /*
     The shared row, not a second fetch of it. The top nav shows the same
     picture, so a private copy here would leave the nav on the old one until a
     reload after every upload.
  */
  const { profile } = useMyProfile();
  const [counts, setCounts] = useState<FollowCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFollowCounts(userId)
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /*
     The username from the session's metadata is shown until the row arrives.
     They are the same string — the signup trigger writes the profile from that
     metadata — so this fills the gap without the name appearing to change.
  */
  const name = profile?.username ?? fallbackUsername ?? "";

  return (
    <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center">
      <AvatarPicker
        url={profile?.avatarUrl}
        name={name}
        onUploaded={(avatarUrl) => patchMyProfile({ avatarUrl })}
      />

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          {profile?.displayName || name}
        </h1>
        {profile?.displayName ? (
          <p className="font-label-md text-label-md text-primary">@{name}</p>
        ) : null}

        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          {profile ? `Joined on ${joinedOn(profile.createdAt)}` : " "}
        </p>

        {profile?.bio ? (
          <p className="mt-2 max-w-prose font-body-md text-body-md text-on-surface-variant">
            {profile.bio}
          </p>
        ) : null}

        <div className="mt-2 flex items-center gap-5 font-label-md text-label-md text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <Icon name="group" className="text-[18px] text-primary" />
            <CountUp value={counts?.followers ?? 0} className="text-on-surface" />
            <span>{counts?.followers === 1 ? "follower" : "followers"}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <CountUp value={counts?.following ?? 0} className="text-on-surface" />
            <span>following</span>
          </span>
        </div>
      </div>

      {/*
         The account icon now opens this screen, so the panel it used to open —
         change password, sign out — needs a door of its own. It is the least
         used thing here, which is why it is a quiet button and not a tab.
      */}
      <button
        type="button"
        onClick={() => setAuthOpen(true)}
        className="flex shrink-0 items-center gap-2 self-start rounded-full bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:self-center"
      >
        <Icon name="manage_accounts" className="text-[18px]" />
        Account
      </button>
    </header>
  );
}

/**
 * The profile picture, and the way to change it.
 *
 * The whole avatar is the control — a separate "upload" button beside a
 * picture is a second thing to look at for an action people already expect to
 * be on the picture itself. The camera badge appears on hover and on keyboard
 * focus so it is discoverable without sitting there permanently.
 *
 * `<input type="file">` is kept in the DOM and driven by the label rather than
 * being created on the fly: a file dialog opened from a synthetic click is
 * blocked by browsers unless it descends from a real user gesture.
 */
function AvatarPicker({
  url,
  name,
  onUploaded,
}: {
  url?: string;
  name: string;
  onUploaded: (url: string) => void;
}) {
  const showToast = useAppStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const next = await uploadAvatar(file);
      /*
         Stored on the profile only after the upload succeeds. Writing the URL
         first would leave the row pointing at a file that may not exist, and
         a broken avatar is worse than none.
      */
      await updateProfile({ avatarUrl: next });
      onUploaded(next);
      showToast("Picture updated.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That picture didn't upload.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="relative h-24 w-24 shrink-0"
    >
      {/* A ring that turns, slowly. Most accounts show the fallback glyph, so
          the life in this corner has to come from somewhere other than the
          picture. */}
      <span className="profile-ring absolute -inset-1 rounded-full" aria-hidden="true" />

      <label
        className={`group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface-container-high ${
          busy ? "cursor-wait" : "cursor-pointer"
        }`}
        title="Change your picture"
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        <span className="sr-only">Change your profile picture</span>

        {url ? (
          // A plain img, not PosterImage: that component's failure fallback is
          // a film-reel glyph, which is the wrong picture for a person.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Icon name="account_circle" fill className="text-[64px] text-primary" />
        )}

        <span
          className={`absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px] transition-opacity duration-200 ${
            busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
        >
          <Icon
            name={busy ? "progress_activity" : "photo_camera"}
            className={`text-[24px] text-white ${busy ? "animate-spin" : ""}`}
          />
        </span>
      </label>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

/** How many of the watchlist the overview shows before handing over to the tab. */
const RECENT_LIMIT = 6;

function Overview({ onOpenView }: { onOpenView: (view: View) => void }) {
  const watchlist = useWatchlist();
  const watched = useWatched();
  const { custom, ready: listsReady } = useLists();
  const history = useSourcesStore((s) => s.history);
  const libraryIds = useAppStore((s) => s.libraryIds);
  const setTab = useAppStore((s) => s.setTab);

  const inLists = useMemo(() => custom.reduce((n, l) => n + l.itemCount, 0), [custom]);
  const saved = watchlist.items.length + inLists;

  return (
    <div className="flex flex-col gap-gutter lg:flex-row">
      {/* ---- Left rail ---- */}
      <aside className="w-full shrink-0 space-y-6 lg:w-72">
        {/*
           Above "Titles saved" whenever there is anything behind it, and
           absent entirely when there is not. Hours watched is the more
           interesting number of the two, and it is the one this profile could
           never honestly show until Stremio started supplying it — and now
           also the one it can answer for an account with nothing connected,
           from the full length of whatever has been marked watched here.
        */}
        <WatchTimeCard />

        {/*
           The hero number when nothing has been watched, and the second figure
           when something has. It is what you have saved — the one thing this
           app knows first-hand about every account, and the one that grows as
           it is used. Hours watched now sits above it, but only where there is
           real playback or a real list behind it: the shape this is modelled
           on leads with hours watched unconditionally, which for an empty
           account means inventing them, and that was the fake "Alex Mercer"
           profile.
        */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="hero-stat rounded-lg p-6"
        >
          <h3 className="font-title-lg text-[15px] text-on-surface/80">Titles saved</h3>
          <CountUp
            value={saved}
            className="mt-2 block font-headline-lg text-[40px] leading-none text-on-surface"
          />
          <p className="mt-1 font-label-md text-label-md text-on-surface/60">
            across your watchlist and lists
          </p>

          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/15 pt-4">
            <div>
              <CountUp
                value={watchlist.items.length}
                className="block font-title-lg text-title-lg text-on-surface"
              />
              <span className="font-label-md text-label-md text-on-surface/60">On watchlist</span>
            </div>
            <div>
              <CountUp
                value={watched.items.length}
                className="block font-title-lg text-title-lg text-on-surface"
              />
              <span className="font-label-md text-label-md text-on-surface/60">Watched</span>
            </div>
            <div>
              <CountUp value={inLists} className="block font-title-lg text-title-lg text-on-surface" />
              <span className="font-label-md text-label-md text-on-surface/60">In your lists</span>
            </div>
          </div>
        </motion.div>

        <div className="glass-panel rounded-lg p-6">
          <h3 className="mb-2 font-title-lg text-title-lg text-on-surface">Stats</h3>
          <StatRow icon="bookmark" label="Watchlisted" value={watchlist.items.length} />
          <StatRow icon="visibility" label="Watched" value={watched.items.length} />
          <StatRow icon="list" label="Lists" value={listsReady ? custom.length : 0} />
          <StatRow icon="subscriptions" label="In Stremio library" value={libraryIds.size} />
          <StatRow icon="history" label="Recent imports" value={history.length} />

          <button
            type="button"
            onClick={() => setTab("library")}
            className="group mt-2 flex w-full items-center justify-between py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="flex items-center gap-3">
              <Icon name="bar_chart" className="text-[20px]" />
              Open My Library
            </span>
            <Icon
              name="chevron_right"
              className="text-[20px] transition-transform duration-200 group-hover:translate-x-1"
            />
          </button>
        </div>
      </aside>

      {/* ---- Main column ---- */}
      <div className="min-w-0 flex-1 space-y-6">
        {/*
           The picker itself, not a read-only row with an "Edit" link that left
           the page. Settings no longer holds a copy of your profile, so this is
           the only place your top fives exist — and editing them where they are
           displayed is the whole reason they moved.
        */}
        <section className="glass-panel rounded-lg p-6">
          <h3 className="font-title-lg text-title-lg text-on-surface">Top Fives</h3>
          <p className="mb-6 mt-1 font-body-md text-body-md text-on-surface-variant">
            The headline of your profile. Anyone who finds you by username can see these.
          </p>
          <TopFive />
        </section>

        <section className="glass-panel rounded-lg p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-title-lg text-title-lg text-on-surface">Recently saved</h3>

            {/*
               The way to the rest of it.

               This shelf is the six most recent of a watchlist that can hold
               hundreds, and until now that was the whole story it told: no
               count, and nothing saying the other titles existed, let alone
               where. The Watchlist tab has always held them — it just had to
               be guessed at.

               Hidden when six is all there is, because "See all 4" on a shelf
               showing four is a control that goes nowhere new.
            */}
            {watchlist.items.length > RECENT_LIMIT ? (
              <button
                type="button"
                onClick={() => onOpenView("watchlist")}
                className="group flex shrink-0 items-center gap-1 rounded-full bg-surface-container px-4 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
              >
                See all {watchlist.items.length}
                <Icon
                  name="chevron_right"
                  className="text-[18px] transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </button>
            ) : null}
          </div>
          {!watchlist.ready ? (
            <div className="h-40 animate-pulse rounded-xl bg-surface-container" />
          ) : watchlist.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
              Nothing yet. Anything you add to your watchlist shows up here first.
            </p>
          ) : (
            /*
               The watchlist comes back newest first and the optimistic add
               puts new titles at the front, so the first six *are* the recent
               ones — no separate activity log to keep in step with the list it
               would be describing.
            */
            <SavedTitleGrid items={watchlist.items.slice(0, RECENT_LIMIT)} />
          )}
        </section>
      </div>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-3 last:border-b-0">
      <span className="flex items-center gap-3 font-body-md text-body-md text-on-surface-variant">
        <Icon name={icon} className="text-[20px] opacity-70" />
        {label}
      </span>
      <CountUp value={value} className="font-title-lg text-[15px] text-on-surface" />
    </div>
  );
}
