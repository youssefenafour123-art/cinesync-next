"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const STORAGE_KEY = "cinesync:motion";

/**
 * How much motion to run. "system" follows `prefers-reduced-motion`, which is
 * the default and the right behaviour — but Windows' "Adjust for best
 * performance" setting turns that flag on for the whole machine, which silently
 * flattens the animated backdrop for people who never asked for it. The two
 * explicit values let someone say what they actually want.
 */
export type MotionPreference = "system" | "full" | "reduced";

const listeners = new Set<() => void>();
let preference: MotionPreference | null = null;

function currentPreference(): MotionPreference {
  if (preference === null) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      preference = raw === "full" || raw === "reduced" ? raw : "system";
    } catch {
      preference = "system";
    }
  }
  return preference;
}

export function setMotionPreference(next: MotionPreference) {
  preference = next;
  try {
    if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private-mode storage failures shouldn't break the toggle for this tab.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  listeners.add(onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    listeners.delete(onChange);
  };
}

function getSnapshot(): boolean {
  const choice = currentPreference();
  if (choice === "full") return false;
  if (choice === "reduced") return true;
  return window.matchMedia(QUERY).matches;
}

// The server has no media queries or storage; assume motion is fine so markup
// matches, and let the post-hydration snapshot correct it.
const getServerSnapshot = () => false;

/**
 * Tracks whether motion should be suppressed. GSAP effects read this to stay
 * idle rather than running infinite timelines for someone who asked not to see
 * them.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The raw setting, for the control in Settings. */
export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(subscribe, currentPreference, () => "system" as const);
}
