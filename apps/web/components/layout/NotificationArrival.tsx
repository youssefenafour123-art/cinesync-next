"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";

/** How long a card stays before it goes back to being a number on the bell. */
const DWELL_MS = 7000;

/**
 * The card that says something arrived.
 *
 * The bell has always been the record of what happened; nothing announced it.
 * A follow is written by a database trigger on somebody else's action, so the
 * only sign of one was a digit appearing on an icon in the corner — which
 * nobody watches, and which meant the answer to "did anyone follow me" was
 * always "open the panel and see".
 *
 * Top right on a desktop, under the bell it belongs to, so the number it
 * leaves behind is in the place the eye was just looking. Full width at the
 * top on a phone, where the bell isn't rendered at all.
 *
 * Pressing it opens what it is about and clears itself. It is not a toast:
 * `Toast` is the app reporting on something you just did and is gone in four
 * seconds, and one slot for both would let a sync error overwrite the only
 * sign that anyone followed you.
 */
export function NotificationArrival() {
  const arrival = useAppStore((s) => s.arrival);
  const clear = useAppStore((s) => s.clearArrival);
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const openPerson = useAppStore((s) => s.openPerson);

  useEffect(() => {
    if (!arrival) return;
    const t = setTimeout(clear, DWELL_MS);
    return () => clearTimeout(t);
  }, [arrival, clear]);

  const follow = arrival?.kind === "follow";

  const open = () => {
    if (!arrival) return;
    if (follow && arrival.actorId) openUserProfile(arrival.actorId);
    else if (!follow && arrival.personTmdbId) openPerson(arrival.personTmdbId);
    clear();
  };

  /*
     `AnimatePresence` stays mounted and the card is what comes and goes.
     Returning null above it — which is what this did first — unmounts the
     presence tracker along with its child, so the exit animation never runs
     and the card vanishes rather than leaving.
  */
  return (
    <AnimatePresence>
      {arrival ? (
        <motion.div
          key={arrival.id}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          role="status"
          aria-live="polite"
          className="glass-panel fixed inset-x-4 top-[84px] z-[380] flex items-center gap-3 rounded-lg p-3 shadow-[0_12px_44px_rgba(0,0,0,0.55)] sm:inset-x-auto sm:right-4 sm:w-[min(22rem,calc(100vw-2rem))]"
        >
          <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15">
              {follow || !arrival.poster ? (
                <Icon
                  name={follow ? "person_add" : "movie"}
                  className="text-primary"
                  style={{ fontSize: 20 }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={arrival.poster} alt="" className="h-full w-full object-cover" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              {follow ? (
                <>
                  <span className="block truncate font-body-md text-[14px] text-on-surface">
                    <span className="font-semibold text-primary">
                      {arrival.actorUsername ?? "Someone"}
                    </span>{" "}
                    started following you
                  </span>
                  <span className="block font-label-md text-[12px] text-on-surface-variant">
                    Tap to see their profile
                  </span>
                </>
              ) : (
                <>
                  <span className="block font-label-md text-[12px] text-primary">
                    New from {arrival.personName}
                  </span>
                  <span className="block truncate font-title-lg text-[14px] text-on-surface">
                    {arrival.title}
                  </span>
                </>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={clear}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
