"use client";

import { create } from "zustand";
import type { MediaItem } from "@/lib/types";

/**
 * `short` is the mobile tab bar's label, and only exists where the full one no
 * longer fits. Seven destinations divide a 390px bar into ~52px cells, which is
 * narrower than "My Library" renders at 10px — it wrapped to two lines and
 * pushed that one item's icon out of alignment with the other six.
 */
export const TABS = [
  { id: "discover", label: "Discover", icon: "explore" },
  { id: "movies", label: "Movies", icon: "movie" },
  { id: "anime", label: "Anime", icon: "auto_awesome" },
  { id: "arabic", label: "Arabic", icon: "public" },
  { id: "tracker", label: "Upcoming", icon: "calendar_month" },
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

  /** IMDb IDs known to be in a connected library — drives the "In Library" badge. */
  libraryIds: Set<string>;
  setLibraryIds: (ids: Set<string>) => void;
  markInLibrary: (id: string) => void;

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
  setLibraryIds: (libraryIds) => set({ libraryIds }),
  markInLibrary: (id) =>
    set((s) => {
      const next = new Set(s.libraryIds);
      next.add(id);
      return { libraryIds: next };
    }),

  toast: null,
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
}));
