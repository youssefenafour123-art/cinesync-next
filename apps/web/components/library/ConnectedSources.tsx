"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";

/**
 * Where a Stremio account or an IMDb list gets linked.
 *
 * Lifted out of the Library tab so Settings can offer it too. Linking an
 * account is a settings-shaped act — it is done once and then forgotten —
 * while the Library tab needs the same list visible right next to the sync
 * button that acts on it. One component, rendered twice, rather than the two
 * copies that would have drifted.
 *
 * The sources themselves stay in `localStorage` and not in Supabase, which is
 * the whole reason this is not on the profile: a Stremio authKey is a
 * credential, and the standing decision is that it never leaves the browser.
 * Signing in on another device means linking again there.
 */
export function ConnectedSources() {
  const sources = useSourcesStore((s) => s.sources);
  const removeSource = useSourcesStore((s) => s.removeSource);
  const setAddSourceOpen = useAppStore((s) => s.setAddSourceOpen);

  return (
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
  );
}
