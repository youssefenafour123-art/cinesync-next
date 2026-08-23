"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useMotionPreference } from "@/lib/useReducedMotion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useLibrarySync } from "@/lib/useLibrarySync";

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

import { DetailsModal } from "@/components/modals/DetailsModal";
import { TrailerModal } from "@/components/modals/TrailerModal";
import { AddSourceModal } from "@/components/modals/AddSourceModal";
import { SearchModal } from "@/components/modals/SearchModal";
import { PersonModal } from "@/components/modals/PersonModal";
import { Toast } from "@/components/ui/Toast";
import { QuoteTicker } from "@/components/ui/QuoteTicker";

export default function Home() {
  const tab = useAppStore((s) => s.tab);
  const details = useAppStore((s) => s.details);
  const trailerKey = useAppStore((s) => s.trailerKey);
  const trailerLoading = useAppStore((s) => s.trailerLoading);
  const addSourceOpen = useAppStore((s) => s.addSourceOpen);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const personId = useAppStore((s) => s.personId);

  const motionPreference = useMotionPreference();

  const hydrate = useSourcesStore((s) => s.hydrate);

  // Keeps the "In Library" badges honest, including after a title is deleted
  // from the Stremio app while this tab sits in the background.
  useLibrarySync();

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

  // Each tab starts at the top rather than inheriting the previous scroll.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

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
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {tab === "discover" && <DiscoverTab onWall={onWall} />}
          {tab === "movies" && <MoviesTab />}
          {tab === "anime" && <AnimeTab />}
          {tab === "arabic" && <ArabicTab />}
          {tab === "tracker" && <TrackerTab />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "library" && <LibraryTab />}
          {tab === "settings" && <SettingsTab />}
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
