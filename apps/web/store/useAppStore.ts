"use client";

import { create } from "zustand";
import type { LibrarySnapshot, WatchedTitle } from "@/lib/stremio";
import type { MediaItem } from "@/lib/types";

/**
 * `short` is the mobile tab bar's label, and only exists where the full one no
 * longer fits. Seven destinations divide a 390px bar into ~52px cells, which is
 * narrower than "My Library" renders at 10px — it wrapped to two lines and
 * pushed that one item's icon out of alignment with the other six.
 */
export const TABS = [
  { id: "discover", label: "Discover", icon: "explore" },
  /*
     Named for what it does, not for one of the two catalogues it covers. The
     tab holds curated rails and a mood browser for films *and* series, chosen
     by a toggle inside it, so "Movies" described half of it. The id stays
     `movies` — it is what the route and the tab component are called, and
     renaming it would touch the payload imports for nothing a viewer sees.
  */
  { id: "movies", label: "Curated", icon: "recommend" },
  { id: "anime", label: "Anime", icon: "auto_awesome" },
  { id: "arabic", label: "Arabic", icon: "public" },
  { id: "tracker", label: "Upcoming", icon: "upcoming" },
  { id: "calendar", label: "Calendar", icon: "calendar_month" },
  { id: "library", label: "My Library", short: "Library", icon: "subscriptions" },
  { id: "settings", label: "Settings", icon: "settings" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface AppState {
  tab: TabId;
  setTab: (tab: TabId) => void;

  /** Item shown in the details modal; null when closed. */
  details: MediaItem | null;
  openDetails: (item: MediaItem) => void;
  closeDetails: () => void;

  /** YouTube key for the trailer modal; null when closed. */
  trailerKey: string | null;
  /** Set while we look a trailer up, so the modal can show a spinner. */
  trailerLoading: boolean;
  openTrailer: (key: string) => void;
  setTrailerLoading: (loading: boolean) => void;
  closeTrailer: () => void;

  addSourceOpen: boolean;
  setAddSourceOpen: (open: boolean) => void;

  /** TMDB person id shown in the person modal; null when closed. */
  personId: number | null;
  openPerson: (id: number) => void;
  closePerson: () => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  /** IMDb IDs currently in a connected library — drives the "In Library" badge. */
  libraryIds: Set<string>;
  /**
   * Every IMDb ID a connected library has ever held, deletions included.
   * Sync reads this so a title the user removed in Stremio is not written back.
   */
  knownLibraryIds: Set<string>;
  /** False until a library has actually been read, so an empty set can be told from an unread one. */
  libraryLoaded: boolean;
  /**
   * The last title played in any connected Stremio account, or null when
   * nothing is connected and nothing has been played. Seeds the
   * "Because you watched" rail on Discover.
   */
  lastWatched: WatchedTitle | null;
  setLibrary: (snapshot: LibrarySnapshot) => void;
  markInLibrary: (id: string) => void;
  unmarkInLibrary: (id: string) => void;

  toast: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  tab: "discover",
  setTab: (tab) => set({ tab }),

  details: null,
  openDetails: (item) => set({ details: item }),
  closeDetails: () => set({ details: null }),

  trailerKey: null,
  trailerLoading: false,
  openTrailer: (key) => set({ trailerKey: key, trailerLoading: false }),
  setTrailerLoading: (trailerLoading) => set({ trailerLoading }),
  closeTrailer: () => set({ trailerKey: null, trailerLoading: false }),

  addSourceOpen: false,
  setAddSourceOpen: (addSourceOpen) => set({ addSourceOpen }),

  personId: null,
  // A profile opened from a film's credits stacks *over* that film rather than
  // replacing it, so closing the profile puts you back on the film you came
  // from. `useModalBehavior` hands out the z-index that makes that work.
  openPerson: (personId) => set({ personId, searchOpen: false }),
  closePerson: () => set({ personId: null }),

  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  libraryIds: new Set<string>(),
  knownLibraryIds: new Set<string>(),
  libraryLoaded: false,
  lastWatched: null,
  setLibrary: (snapshot) =>
    set({
      libraryIds: snapshot.inLibrary,
      knownLibraryIds: snapshot.known,
      libraryLoaded: true,
      lastWatched: snapshot.lastWatched ?? null,
    }),
  markInLibrary: (id) =>
    set((s) => {
      const libraryIds = new Set(s.libraryIds);
      libraryIds.add(id);
      const knownLibraryIds = new Set(s.knownLibraryIds);
      knownLibraryIds.add(id);
      return { libraryIds, knownLibraryIds };
    }),
  /*
     Drops the badge but deliberately leaves `knownLibraryIds` alone.

     Removing here is the same soft delete Stremio performs, so the row still
     exists remotely and a re-read would still report it. Keeping the id in
     `known` is also what stops the next sync treating it as missing and
     writing it straight back from whichever IMDb list it came from.
  */
  unmarkInLibrary: (id) =>
    set((s) => {
      const libraryIds = new Set(s.libraryIds);
      libraryIds.delete(id);
      return { libraryIds };
    }),

  toast: null,
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
}));
