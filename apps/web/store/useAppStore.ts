"use client";

import { create } from "zustand";
import type { AppNotification } from "@/lib/notifications";
import type { LibraryEntry, LibrarySnapshot, WatchedTitle } from "@/lib/stremio";
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
  /*
     The profile is a screen, not a tab.

     It is reached from the account icon and deliberately absent from both nav
     rows, so it cannot be a `TabId` — `TABS` is what those rows render, and
     adding a ninth entry to hide it again would put the exception in two
     places. A flag beside `tab` keeps the nav honest: it lists what it lists.
  */
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;

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

  /** Sign-in / sign-up modal. */
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;

  /** TMDB person id shown in the person modal; null when closed. */
  personId: number | null;
  openPerson: (id: number) => void;
  closePerson: () => void;

  /*
     Someone else's CineSync account, shown in a modal.

     A separate field from `personId` even though both are "a profile": one is
     a TMDB person read from `/api/person`, the other is a row in `profiles`
     read under RLS, and they share nothing but the word. Keeping them apart
     also lets one stack over the other — a director opened from someone's top
     five leaves their profile underneath.
  */
  viewedUserId: string | null;
  openUserProfile: (userId: string) => void;
  closeUserProfile: () => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  /** IMDb IDs currently in a connected library — drives the "In Library" badge. */
  libraryIds: Set<string>;
  /** The library itself — titles and posters, for rendering it. */
  libraryItems: LibraryEntry[];
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
  /**
   * Everything the connected libraries have finished, for the Watched list.
   *
   * Held here rather than read where it is needed because the snapshot is
   * fetched by one hook on a throttle and consumed by another; a second read
   * would be a second pass over every row in every connected account.
   */
  stremioWatched: WatchedTitle[];
  /** Milliseconds played across the connected libraries, and episodes finished. */
  watchedMs: number;
  episodesWatched: number;
  /**
   * Titles a connected player has already measured, finished or abandoned.
   *
   * Read by `useWatchTime`, which estimates a length for everything marked
   * watched by hand and has to skip whatever `watchedMs` already covers.
   */
  playedIds: Set<string>;
  setLibrary: (snapshot: LibrarySnapshot) => void;
  markInLibrary: (id: string) => void;
  unmarkInLibrary: (id: string) => void;

  toast: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;

  /*
     The notification that just arrived, for the card that announces it.

     Separate from `toast`, which is the app talking about what you just did —
     a failed save, a copied link. This is somebody else's action reaching you,
     it stays longer, and it opens something when pressed. Sharing one slot
     would mean a sync error could silently replace the only sign that anyone
     followed you.
  */
  arrival: AppNotification | null;
  announceArrival: (notification: AppNotification) => void;
  clearArrival: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  tab: "discover",
  // Choosing any tab leaves the profile, which is what makes the nav row work
  // as a way back out of it.
  setTab: (tab) => set({ tab, profileOpen: false }),
  profileOpen: false,
  setProfileOpen: (profileOpen) => set({ profileOpen }),

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

  authOpen: false,
  setAuthOpen: (authOpen) => set({ authOpen }),

  personId: null,
  // A profile opened from a film's credits stacks *over* that film rather than
  // replacing it, so closing the profile puts you back on the film you came
  // from. `useModalBehavior` hands out the z-index that makes that work.
  openPerson: (personId) => set({ personId, searchOpen: false }),
  closePerson: () => set({ personId: null }),

  viewedUserId: null,
  openUserProfile: (viewedUserId) => set({ viewedUserId, searchOpen: false }),
  closeUserProfile: () => set({ viewedUserId: null }),

  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  libraryIds: new Set<string>(),
  libraryItems: [],
  knownLibraryIds: new Set<string>(),
  libraryLoaded: false,
  lastWatched: null,
  stremioWatched: [],
  watchedMs: 0,
  episodesWatched: 0,
  playedIds: new Set<string>(),
  setLibrary: (snapshot) =>
    /*
       Absent means "not recomputed", not "empty".

       `useSync` calls this with only the two sets after a sync run, so the
       previous form — `snapshot.lastWatched ?? null` — silently cleared the
       last-played title every time anyone synced, taking the Because You
       Watched rail with it. The same omission would now also empty the
       library grid. What a caller does not supply, it does not touch.
    */
    set((s) => ({
      libraryIds: snapshot.inLibrary,
      knownLibraryIds: snapshot.known,
      libraryLoaded: true,
      lastWatched: snapshot.lastWatched ?? s.lastWatched,
      // Same reasoning as the line above: a snapshot that recomputed only
      // membership carries no watch state, and must not clear what does.
      stremioWatched: snapshot.watched ?? s.stremioWatched,
      // Same rule again: a snapshot that only recomputed membership carries no
      // watch state and must not zero what does.
      watchedMs: snapshot.watchedMs ?? s.watchedMs,
      episodesWatched: snapshot.episodes ?? s.episodesWatched,
      // And once more: membership-only snapshots carry no watch state.
      playedIds: snapshot.played ?? s.playedIds,
      libraryItems: snapshot.items ?? s.libraryItems,
    })),
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
      // Out of the grid as well as out of the badge set, so a removal is
      // visible immediately rather than at the next refresh.
      return { libraryIds, libraryItems: s.libraryItems.filter((e) => e.imdbId !== id) };
    }),

  toast: null,
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),

  arrival: null,
  announceArrival: (arrival) => set({ arrival }),
  clearArrival: () => set({ arrival: null }),
}));
