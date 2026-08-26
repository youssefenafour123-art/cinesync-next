"use client";

import { useCallback, useEffect } from "react";
import { prefetch } from "./useFetch";
import type { TabId } from "@/store/useAppStore";

/**
 * The request each tab makes on arrival, in the order it is worth warming.
 *
 * These strings have to match what the tab component builds character for
 * character — the cache in `useFetch` is keyed by URL, so `?type=movie` and
 * `?type=movie&` are two different entries and a near miss silently prefetches
 * something nothing will ever read. Each entry is the tab's *default* state:
 * the toggles and filters inside a tab are the user's next choice, not this
 * one's business.
 */
function urlsFor(tab: TabId): string[] {
  switch (tab) {
    case "discover":
      return ["/api/discover"];
    case "movies":
      // Both halves of the Curated tab, which fetches its rails and its mood
      // rail independently and would otherwise show one and skeleton the other.
      return ["/api/movies?type=movie", "/api/mood?id=psychological&type=movie"];
    case "anime":
      return ["/api/anime"];
    case "arabic":
      return ["/api/arabic?country=all&genre=all"];
    case "tracker":
      return ["/api/tracker?type=movie"];
    case "calendar":
      return [`/api/calendar?month=${thisMonth()}`];
    // My Library and Settings read localStorage, not the network.
    default:
      return [];
  }
}

/** Mirrors `thisMonth()` in CalendarTab — the month that tab opens on. */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Ordered so the cheapest and most likely destinations are warmed first.
 * Discover is prerendered and already instant; the calendar and the tracker
 * are the two slowest handlers, so they benefit most from going early.
 */
const SWEEP: TabId[] = ["movies", "tracker", "calendar", "anime", "arabic"];

/**
 * Whether speculative fetching is welcome on this connection.
 *
 * The sweep is around 850KB of JSON for tabs the visitor has not asked for,
 * which is a fair trade on a desktop and a rude one on a metered phone.
 * `saveData` is an explicit request not to do this; the slow effective types
 * mean it would also be actively harmful, competing with the page they are
 * actually reading.
 *
 * Absent on Safari and Firefox, where the optional chaining leaves this true —
 * the same behaviour as before, which is the right default for a browser that
 * declines to say.
 *
 * Exported because the same question governs warming the *code* for other
 * tabs, which `app/page.tsx` does on idle. That warm-up shipped without this
 * test and pulled all ten lazy chunks on a phone: 394KB of JavaScript across
 * 24 files on a Fast 3G run, most of it for tabs nobody had opened.
 */
export function speculationWelcome(): boolean {
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  if (!conn) return true;
  if (conn.saveData) return false;
  return !/^(slow-2g|2g|3g)$/.test(conn.effectiveType ?? "");
}

/**
 * Warms every tab's payload once the page has settled.
 *
 * Deliberately not on mount: the first paint, its fonts and the hero's artwork
 * are what the visitor is actually waiting for, and six catalogue requests
 * fired alongside them would compete for the same connections to make a tab
 * fast that nobody has asked for yet. `requestIdleCallback` waits for the main
 * thread to go quiet, and the sweep is staggered so it stays that way.
 *
 * Anything already fetched is skipped inside `prefetch`, so the tab the
 * visitor is looking at is never requested twice.
 */
export function useTabPrefetch(active: TabId) {
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const sweep = () => {
      if (cancelled || !speculationWelcome()) return;
      SWEEP.filter((tab) => tab !== active).forEach((tab, i) => {
        // 300ms apart rather than all at once: a browser will only open so
        // many connections, and a burst would queue the one the visitor is
        // most likely to want behind four they may never open.
        timers.push(setTimeout(() => urlsFor(tab).forEach(prefetch), i * 300));
      });
    };

    // Typed as always present, but Safari only shipped it in 2022 — the
    // `typeof` check is what actually narrows it to something optional.
    const canIdle = typeof window.requestIdleCallback === "function";
    // The 3s timeout is the point: on a page that never goes idle, the sweep
    // still runs rather than being starved forever.
    const handle = canIdle
      ? window.requestIdleCallback(sweep, { timeout: 3000 })
      : window.setTimeout(sweep, 1500);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (canIdle && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
    // Runs once. `active` is read at sweep time to skip the current tab, and
    // re-running the whole sweep on every tab change would be pointless work —
    // everything is cached by then anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Prefetch on intent, for the case the idle sweep hasn't reached yet.
 *
 * The gap between a pointer arriving on a nav item and the click landing is
 * ~100-300ms of otherwise wasted time, and on a cold cache that is the
 * difference between a tab that renders populated and one that renders
 * skeletons.
 */
export function useTabHoverPrefetch() {
  /*
     Not gated on the connection, unlike the sweep. This fires because a
     pointer is on a nav item or a finger is on it — one tab, asked for, about
     to be opened. Fetching it a moment early is the same bytes either way,
     just sooner.
  */
  return useCallback((tab: TabId) => urlsFor(tab).forEach(prefetch), []);
}
