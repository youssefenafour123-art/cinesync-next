import { create } from "zustand";
import type { MediaItem } from "@cinesync/shared/types";

/**
 * The eight destinations, in the order the tab bar shows them.
 *
 * `route` is the expo-router path under `app/(tabs)`; the web app's `id` is
 * kept as well because it is what the API and the analytics-free bits of the
 * code still call each tab. `short` is the label used when the full one no
 * longer fits — eight destinations divide a 390pt bar into ~49pt cells, which
 * is narrower than "My Library" renders at 10pt.
 */
export const TABS = [
  { id: "discover", route: "index", label: "Discover", icon: "explore" },
  { id: "movies", route: "movies", label: "Movies", icon: "movie" },
  { id: "anime", route: "anime", label: "Anime", icon: "auto-awesome" },
  { id: "arabic", route: "arabic", label: "Arabic", icon: "public" },
  { id: "tracker", route: "tracker", label: "Upcoming", icon: "upcoming" },
  { id: "calendar", route: "calendar", label: "Calendar", icon: "calendar-month" },
  {
    id: "library",
    route: "library",
    label: "My Library",
    short: "Library",
    icon: "subscriptions",
  },
  { id: "settings", route: "settings", label: "Settings", icon: "settings" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface AppState {
  /**
   * Every `MediaItem` any screen has shown, keyed by `item.key`.
   *
   * The web app kept a single `details` item in the store because it had one
   * modal. Here the details screen is a route, and a route can be pushed on
   * top of itself — a film's cast opens a person, whose filmography opens
   * another film — so a single slot would make the second screen overwrite the
   * first and both would render the same title on the way back down.
   *
   * `/details/[key]` therefore carries only the key and looks the item up
   * here. Registering is idempotent and nothing is evicted: these are a few
   * hundred small objects per session at most, and dropping one would blank a
   * screen the user can still navigate back to.
   */
  items: Record<string, MediaItem>;
  registerItem: (item: MediaItem) => void;
  registerItems: (items: MediaItem[]) => void;

  /** Posters for the parallax wall behind everything, fed by the Discover screen. */
  wall: string[];
  setWall: (wall: string[]) => void;

  /** IMDb IDs known to be in a connected library — drives the "In Library" badge. */
  libraryIds: Set<string>;
  setLibraryIds: (ids: Set<string>) => void;
  markInLibrary: (id: string) => void;

  toast: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  items: {},
  registerItem: (item) =>
    set((s) => (s.items[item.key] === item ? s : { items: { ...s.items, [item.key]: item } })),
  registerItems: (items) =>
    set((s) => {
      // Only allocate a new object when something actually changed, so a rail
      // re-rendering with the same data doesn't wake every subscriber.
      const missing = items.filter((i) => s.items[i.key] !== i);
      if (!missing.length) return s;
      const next = { ...s.items };
      for (const i of missing) next[i.key] = i;
      return { items: next };
    }),

  wall: [],
  setWall: (wall) => set({ wall }),

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
