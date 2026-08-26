"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import { useSync } from "@/lib/useSync";
import { useLibraryRefresh } from "@/lib/useLibrarySync";
import { useLibraryActions } from "@/lib/useLibraryActions";
import {
  ListsSection,
  WatchedSection,
  WatchlistSection,
} from "@/components/library/SavedSections";
import { StremioLibrary } from "@/components/library/StremioLibrary";
import { metahubPoster } from "@/lib/stremio";
import { Icon } from "@/components/ui/Icon";
import { PosterImage } from "@/components/ui/PosterImage";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { CountUp } from "@/components/ui/CountUp";

export function LibraryTab() {
  const history = useSourcesStore((s) => s.history);
  const libraryIds = useAppStore((s) => s.libraryIds);
  const libraryLoaded = useAppStore((s) => s.libraryLoaded);
  const { state, start, cancel, running } = useSync();
  // Only to decide whether this tab can offer a sync at all; the list of
  // sources themselves lives in Settings now.
  const connectedCount = useSourcesStore((st) => st.sources.length);
  const setTab = useAppStore((st) => st.setTab);
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
      <WatchedSection />
      <ListsSection />

      <StremioLibrary />

      {/* ---- Sync ---- */}
      <section className="glass-panel mb-8 rounded-lg p-6 md:p-8">
        {!showProgress ? (
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div>
              <h3 className="font-title-lg text-title-lg text-on-surface">
                {connectedCount > 0 ? "Ready to Sync" : "Nothing connected yet"}
              </h3>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                {connectedCount > 0 ? (
                  "Merge every connected IMDb list into your connected Stremio account libraries."
                ) : (
                  /*
                     Linking moved to Settings, so this panel is the one place
                     that has to point at it. A Start Sync button above an
                     empty account list, with no way to fill it from here, is
                     a dead end.
                  */
                  <>
                    Connect a Stremio account or an IMDb list in{" "}
                    <button
                      type="button"
                      onClick={() => setTab("settings")}
                      className="text-primary underline underline-offset-2 transition-opacity hover:opacity-80"
                    >
                      Settings
                    </button>{" "}
                    to sync between them.
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={connectedCount > 0 ? start : () => setTab("settings")}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-8 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed"
            >
              <Icon name={connectedCount > 0 ? "sync" : "link"} />
              {connectedCount > 0 ? "Start Sync" : "Connect an account"}
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
                className="poster-live group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-container"
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
