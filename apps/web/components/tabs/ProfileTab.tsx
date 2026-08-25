"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/lib/useSession";
import { useWatchlist } from "@/lib/useWatchlist";
import { useLists } from "@/lib/useLists";
import { useAppStore } from "@/store/useAppStore";
import { useSourcesStore } from "@/store/useSourcesStore";
import { fetchFavourites } from "@/lib/lists";
import type { Favourite } from "@/lib/lists";
import { fetchFollowCounts, fetchProfile, joinedOn } from "@/lib/profile";
import type { FollowCounts, Profile } from "@/lib/profile";
import type { MediaKind } from "@/lib/types";
import { metahubPoster } from "@/lib/stremio";
import { ListsSection, WatchlistSection } from "@/components/library/SavedSections";
import { SavedTitleGrid } from "@/components/ui/SavedTitleGrid";
import { CountUp } from "@/components/ui/CountUp";
import { Icon } from "@/components/ui/Icon";
import { PosterImage } from "@/components/ui/PosterImage";

const VIEWS = [
  { id: "profile", label: "Profile" },
  { id: "lists", label: "Lists" },
  { id: "watchlist", label: "Watchlist" },
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

      {view === "profile" ? <Overview userId={user.id} /> : null}
      {view === "lists" ? <ListsSection /> : null}
      {view === "watchlist" ? <WatchlistSection /> : null}
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<FollowCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});
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
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="relative h-24 w-24 shrink-0"
      >
        {/* A ring that turns, slowly. The avatar is a placeholder glyph for
            most accounts, so the life in this corner has to come from
            somewhere other than the picture. */}
        <span className="profile-ring absolute -inset-1 rounded-full" aria-hidden="true" />
        <span className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface-container-high">
          {profile?.avatarUrl ? (
            <PosterImage
              src={profile.avatarUrl}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Icon name="account_circle" fill className="text-[64px] text-primary" />
          )}
        </span>
      </motion.div>

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

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

function Overview({ userId }: { userId: string }) {
  const watchlist = useWatchlist();
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
           The hero number is what you have saved, because it is the one figure
           this app actually knows and the one that grows as it is used. The
           shape this is modelled on leads with hours watched; CineSync has
           never tracked a minute of playback, and inventing one would be the
           fake "Alex Mercer" profile all over again.
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

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
            <div>
              <CountUp
                value={watchlist.items.length}
                className="block font-title-lg text-title-lg text-on-surface"
              />
              <span className="font-label-md text-label-md text-on-surface/60">On watchlist</span>
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
        <FavouriteRow userId={userId} kind="movie" heading="Favourite films" />
        <FavouriteRow userId={userId} kind="series" heading="Favourite shows" />

        <section className="glass-panel rounded-lg p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-title-lg text-title-lg text-on-surface">Recently saved</h3>
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
            <SavedTitleGrid items={watchlist.items.slice(0, 6)} />
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

/* ------------------------------------------------------------------ *
 * Favourites
 * ------------------------------------------------------------------ */

/**
 * A top five as the profile shows it: five posters, read-only.
 *
 * The picker lives in Settings and stays there. A profile that is also an
 * editor is the pattern that made the old Settings tab full of controls that
 * looked like status.
 */
function FavouriteRow({
  userId,
  kind,
  heading,
}: {
  userId: string;
  kind: MediaKind;
  heading: string;
}) {
  const setTab = useAppStore((s) => s.setTab);
  const openDetails = useAppStore((s) => s.openDetails);
  const [picks, setPicks] = useState<Favourite[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFavourites(userId, kind)
      .then((rows) => {
        if (!cancelled) setPicks(rows);
      })
      .catch(() => {
        if (!cancelled) setPicks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, kind]);

  return (
    <section className="glass-panel rounded-lg p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-title-lg text-title-lg text-on-surface">{heading}</h3>
        <button
          type="button"
          onClick={() => setTab("settings")}
          className="group flex shrink-0 items-center gap-1 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
        >
          Edit
          <Icon
            name="chevron_right"
            className="text-[18px] transition-transform duration-200 group-hover:translate-x-1"
          />
        </button>
      </div>

      {picks === null ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
          No picks yet. Choose five in Settings and they become the headline of this page.
        </p>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-3 gap-4 sm:grid-cols-5"
        >
          {picks.map((p) => (
            <motion.button
              key={p.rank}
              type="button"
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              whileHover={{ y: -8 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={() =>
                openDetails({
                  key: p.imdbId,
                  imdbId: p.imdbId,
                  tmdbId: p.tmdbId,
                  title: p.title,
                  kind: p.kind,
                  poster: p.poster,
                })
              }
              title={p.title}
              className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-container text-left"
            >
              <PosterImage
                src={p.poster ?? metahubPoster(p.imdbId)}
                alt={p.title}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 font-label-md text-[12px] text-primary backdrop-blur-md">
                {p.rank}
              </span>
              <span className="poster-overlay absolute inset-0 flex items-end p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="truncate font-label-md text-[12px] text-on-surface">
                  {p.title}
                </span>
              </span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </section>
  );
}
