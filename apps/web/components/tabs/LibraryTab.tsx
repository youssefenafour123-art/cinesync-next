"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import { useSync } from "@/lib/useSync";
import { useLibraryRefresh } from "@/lib/useLibrarySync";
import { useLibraryActions } from "@/lib/useLibraryActions";
import { useWatchlist } from "@/lib/useWatchlist";
import { useLists } from "@/lib/useLists";
import type { ListSummary, SavedTitle, Visibility } from "@/lib/lists";
import { fetchListItems } from "@/lib/lists";
import {
  SavedTitleGrid,
  SavedTitleGridSkeleton,
  toMediaItem,
} from "@/components/ui/SavedTitleGrid";
import { metahubPoster } from "@/lib/stremio";
import { Icon } from "@/components/ui/Icon";
import { PosterImage } from "@/components/ui/PosterImage";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { CountUp } from "@/components/ui/CountUp";

export function LibraryTab() {
  const sources = useSourcesStore((s) => s.sources);
  const history = useSourcesStore((s) => s.history);
  const removeSource = useSourcesStore((s) => s.removeSource);
  const setAddSourceOpen = useAppStore((s) => s.setAddSourceOpen);
  const libraryIds = useAppStore((s) => s.libraryIds);
  const libraryLoaded = useAppStore((s) => s.libraryLoaded);
  const { state, start, cancel, running } = useSync();
  const { refresh, pending: refreshing, connected } = useLibraryRefresh();
  const { remove, removing } = useLibraryActions();

  const showProgress = state.phase !== "idle";

  /*
    Recent Imports is a log of what this app wrote, but it is read as a view of
    the library — so a title deleted in the Stremio app kept a poster here long
    after it was gone. Deletions are only knowable once a library has actually
    been read, hence the `libraryLoaded` gate: before that, filtering would
    empty the section on every cold load.
  */
  const recent = useMemo(
    () => (libraryLoaded ? history.filter((h) => libraryIds.has(h.id)) : history),
    [history, libraryIds, libraryLoaded],
  );

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-10">
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          My Library
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Connect your Stremio accounts and IMDb lists, then sync your library across all of them.
        </p>
      </div>

      <WatchlistSection />
      <ListsSection />

      {/* ---- Connected sources ---- */}
      <section className="glass-panel mb-8 rounded-lg p-6 md:p-8">
        <h3 className="mb-6 border-b border-white/10 pb-4 font-title-lg text-title-lg text-on-surface">
          Connected Sources
        </h3>

        <AnimatePresence initial={false}>
          {sources.map((source, idx) => {
            const label =
              source.type === "stremio"
                ? source.email
                : source.type === "imdb_list"
                  ? source.name
                  : source.filename;

            const sub =
              source.type === "stremio"
                ? "Connected"
                : source.type === "imdb_list"
                  ? `${source.count} titles · ${source.listKind === "watchlist" ? "watchlist" : "list"}`
                  : `${source.count} titles · CSV`;

            return (
              <motion.div
                key={`${source.type}-${label}`}
                layout
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="glass-card mb-4 flex items-center justify-between rounded-lg p-5"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
                    {source.type === "stremio" ? (
                      <span className="font-title-lg text-title-lg text-primary">S</span>
                    ) : (
                      <span className="font-title-lg text-[13px] font-bold text-[#f5c518]">
                        IMDb
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate font-body-lg text-body-lg font-semibold text-on-surface">
                      {label}
                    </h4>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          source.type === "stremio"
                            ? "bg-primary shadow-[0_0_8px_rgba(78,222,163,0.8)]"
                            : "bg-[#f5c518] shadow-[0_0_8px_rgba(245,197,24,0.8)]"
                        }`}
                      />
                      <span className="truncate font-label-md text-label-md text-on-surface-variant">
                        {sub}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeSource(idx)}
                  aria-label={`Remove ${label}`}
                  className="shrink-0 rounded-full bg-surface-container p-2 text-on-surface-variant transition-colors hover:bg-error/20 hover:text-error"
                >
                  <Icon name="delete" className="text-[20px]" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setAddSourceOpen(true)}
          className="glass-card mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-4 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary/50 hover:text-on-surface"
        >
          <Icon name="add" />
          Add Source
        </button>
      </section>

      {/* ---- Sync ---- */}
      <section className="glass-panel mb-8 rounded-lg p-6 md:p-8">
        {!showProgress ? (
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div>
              <h3 className="font-title-lg text-title-lg text-on-surface">Ready to Sync</h3>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                Merge every connected IMDb list into your connected Stremio account libraries.
              </p>
            </div>
            <button
              type="button"
              onClick={start}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-8 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed"
            >
              <Icon name="sync" />
              Start Sync
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 md:flex-row">
            {state.phase !== "blocked" ? <ProgressRing percent={state.percent} /> : null}

            <div className="flex-1 text-center md:text-left">
              <h3 className="font-title-lg text-title-lg text-on-surface">{state.title}</h3>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                {state.detail}
              </p>

              {state.phase !== "blocked" ? (
                <div className="mt-4 flex items-center justify-center gap-6 md:justify-start">
                  <Tally label="Added" value={state.added} className="text-primary" />
                  <Tally label="Skipped" value={state.skipped} className="text-on-surface" />
                  <Tally label="Failed" value={state.failed} className="text-error" />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={cancel}
              disabled={running && state.detail.startsWith("Cancelling")}
              className="shrink-0 whitespace-nowrap rounded-full bg-surface-container-high px-8 py-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-60"
            >
              {running ? "Cancel Sync" : "Done"}
            </button>
          </div>
        )}
      </section>

      {/* ---- Recent imports ---- */}
      <section>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="font-title-lg text-title-lg text-on-surface">Recent Imports</h3>
          {connected ? (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="flex shrink-0 items-center gap-2 rounded-full bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-60"
            >
              <Icon name="refresh" className={`text-[18px] ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh from Stremio"}
            </button>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 py-10 text-center font-body-md text-body-md text-on-surface-variant">
            {history.length > 0
              ? "Everything imported recently has since been removed from your Stremio library."
              : "No recent imports found. Click Start Sync!"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {recent.slice(0, 6).map((h) => (
              <motion.div
                key={`${h.id}-${h.timestamp}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-container"
              >
                <PosterImage
                  src={metahubPoster(h.id)}
                  alt={h.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="poster-overlay absolute inset-0 flex flex-col justify-end p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
                  <h4 className="truncate font-title-lg text-[15px] text-on-surface">{h.title}</h4>
                  <p className="font-label-md text-[12px] text-primary">{relativeTime(h.timestamp)}</p>
                </div>
                {/*
                   Removing from the shelf you are looking at, rather than
                   having to open the title first. It stays hidden until the
                   tile is hovered or the button itself is focused, so a grid
                   of posters isn't a grid of delete buttons.
                */}
                <button
                  type="button"
                  onClick={() => void remove({ imdbId: h.id, title: h.title, kind: h.type })}
                  disabled={removing}
                  aria-label={`Remove ${h.title} from your Stremio library`}
                  title={`Remove ${h.title} from your Stremio library`}
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white opacity-0 backdrop-blur-md transition-all duration-200 hover:bg-error hover:text-on-error focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                >
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The account's watchlist.
 *
 * Signed-in only, and it renders nothing at all otherwise. Every other section
 * of this tab works signed out and always has, so a panel inviting an
 * anonymous visitor to sign in would push three working features down the page
 * to advertise one that isn't available yet.
 */
function WatchlistSection() {
  const { items, ready, signedIn, toggle, pending } = useWatchlist();

  if (!signedIn) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Watchlist" count={ready ? items.length : undefined} />

      {!ready ? (
        <SavedTitleGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyShelf>Nothing saved yet. Open any title and press Watchlist to keep it here.</EmptyShelf>
      ) : (
        <SavedTitleGrid
          items={items}
          onRemove={(t) => void toggle(toMediaItem(t))}
          removeLabel={(t) => `Remove ${t.title} from your watchlist`}
          busy={pending}
        />
      )}
    </section>
  );
}

/**
 * The lists the user made, each opening onto its own shelf.
 *
 * Expanding in place rather than in a modal. The details modal is already the
 * thing a poster opens, and a list opened as a modal that then opens another
 * modal on top is a stack the shell was not built for — `ModalShell` owns one
 * scroll lock and one z-index tier.
 */
function ListsSection() {
  const { custom, ready, signedIn, create, remove, setVisibility, removeTitle, pending } =
    useLists();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!signedIn) return null;

  return (
    <section className="mb-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h3 className="font-title-lg text-title-lg text-on-surface">My Lists</h3>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex shrink-0 items-center gap-2 rounded-full bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name={creating ? "close" : "playlist_add"} className="text-[18px]" />
          {creating ? "Cancel" : "New list"}
        </button>
      </div>

      {creating ? (
        <NewListForm
          pending={pending}
          onCreate={async (name, visibility) => {
            const id = await create(name, visibility);
            if (id) setCreating(false);
            return id !== null;
          }}
        />
      ) : null}

      {!ready ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-lg bg-surface-container" />
          ))}
        </div>
      ) : custom.length === 0 ? (
        <EmptyShelf>
          No lists yet. Make one for a marathon, a genre, or the films you keep meaning to rewatch.
        </EmptyShelf>
      ) : (
        <div className="space-y-3">
          {custom.map((list) => (
            <ListRow
              key={list.id}
              list={list}
              open={openId === list.id}
              onToggleOpen={() => setOpenId((id) => (id === list.id ? null : list.id))}
              onDelete={() => void remove(list.id)}
              onVisibility={(v) => void setVisibility(list.id, v)}
              onRemoveTitle={(imdbId) => removeTitle(list.id, imdbId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h3 className="font-title-lg text-title-lg text-on-surface">{title}</h3>
      {count ? (
        <span className="shrink-0 font-label-md text-label-md text-on-surface-variant">
          {count} {count === 1 ? "title" : "titles"}
        </span>
      ) : null}
    </div>
  );
}

function EmptyShelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
      {children}
    </div>
  );
}

/** How the three visibility states are named to the person choosing one. */
const VISIBILITY: { value: Visibility; label: string; icon: string; hint: string }[] = [
  { value: "private", label: "Only me", icon: "lock", hint: "Nobody else can see this list." },
  {
    value: "followers",
    label: "Followers",
    icon: "group",
    hint: "The people who follow you can see this list.",
  },
  { value: "public", label: "Anyone", icon: "public", hint: "Anyone with your profile can see it." },
];

function ListRow({
  list,
  open,
  onToggleOpen,
  onDelete,
  onVisibility,
  onRemoveTitle,
}: {
  list: ListSummary;
  open: boolean;
  onToggleOpen: () => void;
  onDelete: () => void;
  onVisibility: (v: Visibility) => void;
  onRemoveTitle: (imdbId: string) => Promise<boolean>;
}) {
  const [items, setItems] = useState<SavedTitle[] | null>(null);
  const [armed, setArmed] = useState(false);

  /*
     Items are fetched when the row is first opened, not alongside the list
     itself. The Library tab would otherwise issue one request per list on
     every visit, to render counts it already has from the aggregate.
  */
  useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;
    void fetchListItems(list.id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, items, list.id]);

  // Arming a delete has to expire. A row left armed and forgotten turns the
  // next click on it into a deletion nobody meant this time.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const current = VISIBILITY.find((v) => v.value === list.visibility) ?? VISIBILITY[1];

  return (
    <div className="glass-card overflow-hidden rounded-lg">
      <div className="flex items-center gap-3 p-4 md:gap-4 md:p-5">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
            <Icon name="list" className="text-[22px] text-primary" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate font-body-lg text-body-lg font-semibold text-on-surface">
              {list.name}
            </h4>
            <div className="mt-1 flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
              <span>
                {list.itemCount} {list.itemCount === 1 ? "title" : "titles"}
              </span>
              <span aria-hidden>&middot;</span>
              <span className="flex items-center gap-1">
                <Icon name={current.icon} className="text-[14px]" />
                {current.label}
              </span>
            </div>
          </div>
          <Icon
            name="expand_more"
            className={`ml-auto shrink-0 text-on-surface-variant transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {/*
             A native select: three mutually exclusive states, and the platform
             already renders that correctly on a phone, with a keyboard, and to
             a screen reader.
          */}
          <label className="sr-only" htmlFor={`vis-${list.id}`}>
            Who can see {list.name}
          </label>
          <select
            id={`vis-${list.id}`}
            value={list.visibility}
            onChange={(e) => onVisibility(e.target.value as Visibility)}
            title={current.hint}
            className="rounded-full bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            {VISIBILITY.map((v) => (
              <option key={v.value} value={v.value} className="bg-surface-container text-on-surface">
                {v.label}
              </option>
            ))}
          </select>

          {/*
             Two presses to delete, and the arming expires. There is no undo
             behind this — the items go with the list, on delete cascade — and
             one mis-aimed click on a row of buttons should not be able to take
             a list with it.
          */}
          <button
            type="button"
            onClick={() => {
              if (armed) onDelete();
              else setArmed(true);
            }}
            aria-label={armed ? `Confirm deleting ${list.name}` : `Delete ${list.name}`}
            className={`rounded-full p-2 transition-colors ${
              armed
                ? "bg-error text-on-error"
                : "bg-surface-container text-on-surface-variant hover:bg-error/20 hover:text-error"
            }`}
          >
            <Icon name={armed ? "delete_forever" : "delete"} className="text-[20px]" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/10 p-4 md:p-5">
          {items === null ? (
            <SavedTitleGridSkeleton count={3} />
          ) : items.length === 0 ? (
            <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
              This list is empty. Open a title and add it from there.
            </p>
          ) : (
            <SavedTitleGrid
              items={items}
              onRemove={(t) => {
                const before = items;
                setItems(items.filter((x) => x.imdbId !== t.imdbId));
                void onRemoveTitle(t.imdbId).then((ok) => {
                  if (!ok) setItems(before);
                });
              }}
              removeLabel={(t) => `Remove ${t.title} from ${list.name}`}
              removeIcon="playlist_remove"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function NewListForm({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (name: string, visibility: Visibility) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  // Matches the column default. A new list is shown to the people who follow
  // you, not to everyone and not to nobody.
  const [visibility, setVisibility] = useState<Visibility>("followers");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void onCreate(name, visibility).then((ok) => {
          if (ok) setName("");
        });
      }}
      className="glass-card mb-4 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name"
        maxLength={60}
        autoFocus
        aria-label="List name"
        className="min-w-0 flex-1 rounded-full bg-surface-container px-4 py-2.5 font-body-md text-body-md text-on-surface outline-none ring-primary/60 placeholder:text-on-surface-variant focus-visible:ring-2"
      />
      <select
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as Visibility)}
        aria-label="Who can see this list"
        className="rounded-full bg-surface-container px-4 py-2.5 font-label-md text-label-md text-on-surface-variant"
      >
        {VISIBILITY.map((v) => (
          <option key={v.value} value={v.value} className="bg-surface-container text-on-surface">
            {v.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="shrink-0 rounded-full bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}

function Tally({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="text-center">
      <CountUp value={value} className={`font-title-lg text-title-lg ${className}`} />
      <div className="font-label-md text-label-md text-on-surface-variant">{label}</div>
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "Added just now";
  if (minutes < 60) return `Added ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Added ${hours}h ago`;
  return `Added ${Math.round(hours / 24)}d ago`;
}
