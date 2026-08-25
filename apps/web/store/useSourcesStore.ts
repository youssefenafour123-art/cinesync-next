"use client";

import { create } from "zustand";
import type { HistoryEntry, Source, StremioSource, SyncItem } from "@/lib/types";

/**
 * Same localStorage keys and shapes as the legacy app, so data saved by the
 * old index.html keeps working here.
 */
const SOURCES_KEY = "cineSyncSources";
const HISTORY_KEY = "cineSyncHistory";
const SETTINGS_KEY = "cineSyncSettings";

export interface AppSettings {
  autoSync: boolean;
  pushNotifications: boolean;
  oledMode: boolean;
  tmdbKey: string;
  traktId: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoSync: true,
  pushNotifications: false,
  oledMode: true,
  tmdbKey: "",
  traktId: "",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode — non-fatal.
  }
}

interface SourcesState {
  hydrated: boolean;
  sources: Source[];
  history: HistoryEntry[];
  settings: AppSettings;

  hydrate: () => void;
  addStremio: (email: string, authKey: string) => void;
  addCsv: (filename: string, items: SyncItem[]) => void;
  addImdbList: (
    url: string,
    listKind: "list" | "watchlist",
    name: string,
    items: SyncItem[],
  ) => void;
  removeSource: (index: number) => void;
  addHistory: (entries: HistoryEntry[]) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  hydrated: false,
  sources: [],
  history: [],
  settings: DEFAULT_SETTINGS,

  hydrate: () => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      sources: read<Source[]>(SOURCES_KEY, []),
      history: read<HistoryEntry[]>(HISTORY_KEY, []),
      settings: { ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(SETTINGS_KEY, {}) },
    });
  },

  addStremio: (email, authKey) => {
    const sources = get().sources;
    if (sources.some((s) => s.type === "stremio" && s.email === email)) {
      throw new Error("That account is already connected.");
    }
    const next: Source[] = [...sources, { type: "stremio", email, authKey, addedAt: Date.now() }];
    write(SOURCES_KEY, next);
    set({ sources: next });
  },

  addCsv: (filename, items) => {
    const sources = get().sources;
    const entry = { type: "imdb_csv" as const, filename, count: items.length, items, addedAt: Date.now() };
    // Re-uploading the same filename replaces the old list rather than duplicating it.
    const existing = sources.findIndex((s) => s.type === "imdb_csv" && s.filename === filename);
    const next = [...sources];
    if (existing > -1) next[existing] = entry;
    else next.push(entry);
    write(SOURCES_KEY, next);
    set({ sources: next });
  },

  addImdbList: (url, listKind, name, items) => {
    const sources = get().sources;
    const entry = {
      type: "imdb_list" as const,
      url,
      listKind,
      name,
      count: items.length,
      items,
      addedAt: Date.now(),
    };
    // Re-importing the same URL refreshes that list rather than duplicating it.
    const existing = sources.findIndex((s) => s.type === "imdb_list" && s.url === url);
    const next = [...sources];
    if (existing > -1) next[existing] = entry;
    else next.push(entry);
    write(SOURCES_KEY, next);
    set({ sources: next });
  },

  removeSource: (index) => {
    const next = get().sources.filter((_, i) => i !== index);
    write(SOURCES_KEY, next);
    set({ sources: next });
  },

  addHistory: (entries) => {
    const next = [...entries, ...get().history].slice(0, 12);
    write(HISTORY_KEY, next);
    set({ history: next });
  },

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    write(SETTINGS_KEY, next);
    set({ settings: next });
  },
}));

/** Convenience selector — the auth keys sync and "Add to Library" need. */
export function stremioAccounts(sources: Source[]): StremioSource[] {
  return sources.filter((s): s is StremioSource => s.type === "stremio");
}
