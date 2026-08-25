"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useMotionPreference } from "@/lib/useReducedMotion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useLibrarySync } from "@/lib/useLibrarySync";
import { useTabPrefetch } from "@/lib/useTabPrefetch";

import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { AmbientBackground } from "@/components/layout/AmbientBackground";

import { DiscoverTab } from "@/components/tabs/DiscoverTab";
import { MoviesTab } from "@/components/tabs/MoviesTab";
import { AnimeTab } from "@/components/tabs/AnimeTab";
import { ArabicTab } from "@/components/tabs/ArabicTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { TrackerTab } from "@/components/tabs/TrackerTab";
import { LibraryTab } from "@/components/tabs/LibraryTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";

import { DetailsModal } from "@/components/modals/DetailsModal";
import { TrailerModal } from "@/components/modals/TrailerModal";
import { AddSourceModal } from "@/components/modals/AddSourceModal";
import { AuthModal } from "@/components/modals/AuthModal";
import { SearchModal } from "@/components/modals/SearchModal";
import { PersonModal } from "@/components/modals/PersonModal";
import { Toast } from "@/components/ui/Toast";
import { QuoteTicker } from "@/components/ui/QuoteTicker";

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

  const motionPreference = useMotionPreference();

  const hydrate = useSourcesStore((s) => s.hydrate);

  // Keeps the "In Library" badges honest, including after a title is deleted
  // from the Stremio app while this tab sits in the background.
  useLibrarySync();

  // Warms the other tabs' payloads once the page goes idle, so switching to
  // one renders populated instead of paying its route handler's cold cost.
  useTabPrefetch(tab);

  const [wall, setWall] = useState<string[]>([]);
  const onWall = useCallback((posters: string[]) => setWall(posters), []);

  // localStorage is only readable on the client, so hydrate after mount.
  useEffect(() => hydrate(), [hydrate]);

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
