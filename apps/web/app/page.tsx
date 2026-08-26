"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useMotionPreference } from "@/lib/useReducedMotion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useLibrarySync } from "@/lib/useLibrarySync";
import { useWatchedSync } from "@/lib/useWatchedSync";
import { speculationWelcome, useTabPrefetch } from "@/lib/useTabPrefetch";
import { primeNotificationCue } from "@/lib/notificationCue";

import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { AmbientBackground } from "@/components/layout/AmbientBackground";

import { DiscoverTab } from "@/components/tabs/DiscoverTab";
import { NotificationArrival } from "@/components/layout/NotificationArrival";
import { Toast } from "@/components/ui/Toast";
import { QuoteTicker } from "@/components/ui/QuoteTicker";

/*
   Everything below arrives after the page does.

   The whole app is one route, so a static import here is a promise that the
   first visitor downloads all nine tabs and all seven modals before Discover
   can render — 392KB of compressed JavaScript to show a page that uses about
   a fifth of it. Discover stays static because it is what loads first;
   everything else is fetched when it is opened.

   `chunks` below then warms them once the page is idle, so a tab switch is
   still instant on a connection that has already paid for the download.
*/
const chunks = {
  movies: () => import("@/components/tabs/MoviesTab"),
  anime: () => import("@/components/tabs/AnimeTab"),
  arabic: () => import("@/components/tabs/ArabicTab"),
  calendar: () => import("@/components/tabs/CalendarTab"),
  tracker: () => import("@/components/tabs/TrackerTab"),
  library: () => import("@/components/tabs/LibraryTab"),
  settings: () => import("@/components/tabs/SettingsTab"),
  profile: () => import("@/components/tabs/ProfileTab"),
  details: () => import("@/components/modals/DetailsModal"),
  search: () => import("@/components/modals/SearchModal"),
};

/**
 * What a tab looks like for the moment its code is in flight.
 *
 * Deliberately not a spinner: the tab it stands in for is about to paint, and
 * a spinner that appears and vanishes inside 100ms reads as a flicker. Empty
 * space of roughly the right height does not.
 */
function TabPending() {
  return <div className="min-h-[60vh]" />;
}

const MoviesTab = dynamic(() => chunks.movies().then((m) => m.MoviesTab), {
  loading: TabPending,
});
const AnimeTab = dynamic(() => chunks.anime().then((m) => m.AnimeTab), { loading: TabPending });
const ArabicTab = dynamic(() => chunks.arabic().then((m) => m.ArabicTab), { loading: TabPending });
const CalendarTab = dynamic(() => chunks.calendar().then((m) => m.CalendarTab), {
  loading: TabPending,
});
const TrackerTab = dynamic(() => chunks.tracker().then((m) => m.TrackerTab), {
  loading: TabPending,
});
const LibraryTab = dynamic(() => chunks.library().then((m) => m.LibraryTab), {
  loading: TabPending,
});
const SettingsTab = dynamic(() => chunks.settings().then((m) => m.SettingsTab), {
  loading: TabPending,
});
const ProfileTab = dynamic(() => chunks.profile().then((m) => m.ProfileTab), {
  loading: TabPending,
});

/*
   The modals render nothing until something opens them, so they have no
   loading state at all: `AnimatePresence` already treats them as absent, and
   the code arrives in the same tick the backdrop animates in.
*/
const DetailsModal = dynamic(() => chunks.details().then((m) => m.DetailsModal));
const TrailerModal = dynamic(() =>
  import("@/components/modals/TrailerModal").then((m) => m.TrailerModal),
);
const AddSourceModal = dynamic(() =>
  import("@/components/modals/AddSourceModal").then((m) => m.AddSourceModal),
);
const AuthModal = dynamic(() => import("@/components/modals/AuthModal").then((m) => m.AuthModal));
const SearchModal = dynamic(() => chunks.search().then((m) => m.SearchModal));
const PersonModal = dynamic(() =>
  import("@/components/modals/PersonModal").then((m) => m.PersonModal),
);
const UserProfileModal = dynamic(() =>
  import("@/components/modals/UserProfileModal").then((m) => m.UserProfileModal),
);

export default function Home() {
  const tab = useAppStore((s) => s.tab);
  const profileOpen = useAppStore((s) => s.profileOpen);
  /*
     What is actually on screen. The profile sits over the tab rather than
     replacing it, so leaving the profile returns to whatever tab was open
     underneath instead of resetting to Discover.
  */
  const screen = profileOpen ? "profile" : tab;
  const details = useAppStore((s) => s.details);
  const trailerKey = useAppStore((s) => s.trailerKey);
  const trailerLoading = useAppStore((s) => s.trailerLoading);
  const addSourceOpen = useAppStore((s) => s.addSourceOpen);
  const authOpen = useAppStore((s) => s.authOpen);
  const setAuthOpen = useAppStore((s) => s.setAuthOpen);
  const showToast = useAppStore((s) => s.showToast);
  const [authMode, setAuthMode] = useState<"signin" | "reset">("signin");

  /*
     A recovery link comes back through `/auth/callback`, which exchanges the
     code for a session and redirects here with `?reset=1`. The session is
     real at that point, so without this the person lands signed in with no
     way to actually change the password they came to change.

     The marker is removed from the address bar afterwards so a reload doesn't
     reopen the step they already finished.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    /*
       A rejected link — expired, already used, or arriving without a code —
       comes back as `?auth_error=`. The callback has always set it and nothing
       has ever read it, so the failure it was written to report landed on the
       homepage as a query string nobody looked at: exactly the silent
       "the page just opened, signed out" that route exists to prevent.
    */
    const authError = params.get("auth_error");
    if (authError) showToast(authError);

    const wantsReset = params.get("reset") === "1";
    if (wantsReset) {
      setAuthMode("reset");
      setAuthOpen(true);
    }

    if (!authError && !wantsReset) return;

    params.delete("reset");
    params.delete("auth_error");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, [setAuthOpen, showToast]);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const personId = useAppStore((s) => s.personId);
  const viewedUserId = useAppStore((s) => s.viewedUserId);

  const motionPreference = useMotionPreference();

  const hydrate = useSourcesStore((s) => s.hydrate);

  // Keeps the "In Library" badges honest, including after a title is deleted
  // from the Stremio app while this tab sits in the background.
  useLibrarySync();

  // And puts what those libraries have finished into the Watched list. Reads
  // the snapshot the line above refreshes, so it costs no request of its own.
  useWatchedSync();

  // Warms the other tabs' payloads once the page goes idle, so switching to
  // one renders populated instead of paying its route handler's cold cost.
  useTabPrefetch(tab);

  /*
     And the same for their code.

     The split above keeps the other tabs out of the first load; this puts them
     in the browser's cache shortly after it, so pressing a tab still swaps
     instantly rather than waiting on a network round trip. Idle rather than on
     mount, so it competes with nothing that is still painting — and behind a
     timeout for Safari, where `requestIdleCallback` arrived late.

     The two modals in the list are the ones reachable from any tab: a poster
     opens Details, and `/` opens Search.
  */
  useEffect(() => {
    const warm = () => {
      /*
         Not on a metered or slow connection, and not on a phone.

         Ten chunks of code for tabs nobody has opened is a fair trade on a
         desktop and a rude one on a handset. `speculationWelcome` is the same
         test the payload sweep uses — saveData, or a slow effective type — but
         it answers "yes" for a phone on good 4G, and Chrome does not update
         `effectiveType` under emulated throttling either, so a measured run
         still pulled all 394KB across 24 files.

         The width test is the one that actually holds on a handset. What it
         costs is a few hundred milliseconds the first time a phone opens a
         second tab, against every phone paying for nine tabs it never opened.
      */
      if (!speculationWelcome()) return;
      if (!window.matchMedia("(min-width: 640px)").matches) return;
      for (const load of Object.values(chunks)) void load();
    };
    const idle = window.requestIdleCallback;
    if (idle) {
      const id = idle(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(warm, 2000);
    return () => clearTimeout(t);
  }, []);

  const [wall, setWall] = useState<string[]>([]);
  const onWall = useCallback((posters: string[]) => setWall(posters), []);

  // localStorage is only readable on the client, so hydrate after mount.
  useEffect(() => hydrate(), [hydrate]);

  /*
     Wakes the audio clock on the first click or keypress.

     Every notification this app plays a sound for arrives from a background
     poll, which is never a user gesture — and a browser keeps an AudioContext
     suspended until it has seen one. Priming early means the context is
     already running by the time anything lands.
  */
  useEffect(() => primeNotificationCue(), []);

  /*
    Mirror the motion preference onto <html> so CSS can read it.

    The GSAP and Framer effects take it from `useReducedMotion`, but the hero
    slides, their dot timers and the poster wall's marquees are CSS animations,
    and CSS can only see `prefers-reduced-motion`. Windows sets that flag for
    the whole machine under "Adjust for best performance", so without this
    attribute someone who explicitly chose "Full motion" would still get frozen
    CSS animations while everything driven from JavaScript ran — motion working
    in half the app and not the other half. `globals.css` gates on
    `[data-motion]`; see the block next to the reduced-motion media query.
  */
  useEffect(() => {
    document.documentElement.dataset.motion = motionPreference;
  }, [motionPreference]);

  // Each screen starts at the top rather than inheriting the previous scroll.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  return (
    <>
      <AmbientBackground wall={wall} />
      <TopNav />

      <main className="relative z-10 min-h-screen pb-28 pt-[72px] md:pb-8 md:pt-[80px]">
        {/*
          Deliberately not AnimatePresence + mode="wait" here. That waits for
          the outgoing tab's exit animation before mounting the incoming one,
          so anything that stalls the animation frame loop — a backgrounded or
          occluded window — leaves the page permanently blank. Keying the
          motion.div on `tab` swaps content immediately and fades the new tab
          in, which looks the same and can't get stuck.
        */}
        <motion.div
          key={screen}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {screen === "profile" && <ProfileTab />}
          {screen === "discover" && <DiscoverTab onWall={onWall} />}
          {screen === "movies" && <MoviesTab />}
          {screen === "anime" && <AnimeTab />}
          {screen === "arabic" && <ArabicTab />}
          {screen === "tracker" && <TrackerTab />}
          {screen === "calendar" && <CalendarTab />}
          {screen === "library" && <LibraryTab />}
          {screen === "settings" && <SettingsTab />}
        </motion.div>
      </main>

      <BottomNav />

      <AnimatePresence>
        {details ? <DetailsModal key={details.key} item={details} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {trailerKey || trailerLoading ? <TrailerModal key="trailer" /> : null}
      </AnimatePresence>

      <AnimatePresence>{addSourceOpen ? <AddSourceModal key="source" /> : null}</AnimatePresence>

      <AnimatePresence>
        {authOpen ? (
          <AuthModal
            key="auth"
            initialMode={authMode}
            onClose={() => {
              setAuthOpen(false);
              setAuthMode("signin");
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>{searchOpen ? <SearchModal key="search" /> : null}</AnimatePresence>

      <AnimatePresence>
        {personId ? <PersonModal key={`person-${personId}`} id={personId} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {viewedUserId ? (
          <UserProfileModal key={`user-${viewedUserId}`} userId={viewedUserId} />
        ) : null}
      </AnimatePresence>

      <NotificationArrival />

      <Toast />

      <footer className="relative z-10 pb-28 pt-4 md:pb-8">
        {/* Sits outside the tab shell, so the quote keeps rotating across a tab
            change rather than remounting and restarting on every navigation. */}
        <QuoteTicker />

        <div className="border-t border-white/5 pt-8 text-center text-sm tracking-wide text-on-surface-variant/70">
          Created by <strong className="text-primary">el waadudi</strong>
        </div>
      </footer>
    </>
  );
}
