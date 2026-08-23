"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import { useSync } from "@/lib/useSync";
import { useLibraryRefresh } from "@/lib/useLibrarySync";
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
                <div className="poster-overlay absolute inset-0 flex flex-col justify-end p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <h4 className="truncate font-title-lg text-[15px] text-on-surface">{h.title}</h4>
                  <p className="font-label-md text-[12px] text-primary">{relativeTime(h.timestamp)}</p>
                </div>
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
