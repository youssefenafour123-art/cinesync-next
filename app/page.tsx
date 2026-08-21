"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { stremioAccounts, useSourcesStore } from "@/store/useSourcesStore";
import { fetchLibraryIds } from "@/lib/stremio";

import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { AmbientBackground } from "@/components/layout/AmbientBackground";

import { DiscoverTab } from "@/components/tabs/DiscoverTab";
import { MoviesTab } from "@/components/tabs/MoviesTab";
import { AnimeTab } from "@/components/tabs/AnimeTab";
import { TrackerTab } from "@/components/tabs/TrackerTab";
import { LibraryTab } from "@/components/tabs/LibraryTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";

import { DetailsModal } from "@/components/modals/DetailsModal";
import { TrailerModal } from "@/components/modals/TrailerModal";
import { AddSourceModal } from "@/components/modals/AddSourceModal";
import { SearchModal } from "@/components/modals/SearchModal";
import { PersonModal } from "@/components/modals/PersonModal";
import { Toast } from "@/components/ui/Toast";

export default function Home() {
  const tab = useAppStore((s) => s.tab);
  const details = useAppStore((s) => s.details);
  const trailerKey = useAppStore((s) => s.trailerKey);
  const trailerLoading = useAppStore((s) => s.trailerLoading);
  const addSourceOpen = useAppStore((s) => s.addSourceOpen);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const personId = useAppStore((s) => s.personId);
  const setLibraryIds = useAppStore((s) => s.setLibraryIds);

  const hydrate = useSourcesStore((s) => s.hydrate);
  const hydrated = useSourcesStore((s) => s.hydrated);
  const sources = useSourcesStore((s) => s.sources);

  const [wall, setWall] = useState<string[]>([]);
  const onWall = useCallback((posters: string[]) => setWall(posters), []);

  // localStorage is only readable on the client, so hydrate after mount.
  useEffect(() => hydrate(), [hydrate]);

  // Pull known library IDs once accounts are known, so "In Library" badges are
  // correct everywhere without each card making its own request.
  useEffect(() => {
    if (!hydrated) return;
    const accounts = stremioAccounts(sources);
    if (!accounts.length) return;

    let cancelled = false;
    void Promise.all(accounts.map((a) => fetchLibraryIds(a.authKey))).then((sets) => {
      if (cancelled) return;
      const merged = new Set<string>();
      for (const s of sets) for (const id of s) merged.add(id);
      setLibraryIds(merged);
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, sources, setLibraryIds]);

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
          {tab === "tracker" && <TrackerTab />}
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

      <footer className="relative z-10 pb-28 pt-8 text-center text-sm tracking-wide text-on-surface-variant/70 md:pb-8">
        Created by <strong className="text-primary">el waadudi</strong>
      </footer>
    </>
  );
}
