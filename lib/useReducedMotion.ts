"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const STORAGE_KEY = "cinesync:motion";

/**
 * How much motion to run.
 *
 * "system" follows `prefers-reduced-motion`. That is the textbook default, and
 * it was the default here — but it turns out to be the wrong one for this app.
 * Windows sets the reduced-motion flag for the whole machine under Visual
 * Effects → "Adjust for best performance", a *performance* setting that people
 * enable without any intent to suppress animation. The result was that the
 * animated backdrop, the hero sliders and the rail scrolling all rendered as
 * still images for anyone who had ever touched that checkbox, with no clue as
 * to why.
 *
 * So the default is now "full", and "Match system" is one click away in
 * Settings → Appearance for anyone who wants the OS to decide. The preference
 * is stored for all three values — absence of a stored value means "full", not
 * "system", so the default survives a reload.
 */
export type MotionPreference = "system" | "full" | "reduced";

const DEFAULT_PREFERENCE: MotionPreference = "full";

const listeners = new Set<() => void>();
let preference: MotionPreference | null = null;

function currentPreference(): MotionPreference {
  if (preference === null) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      preference =
        raw === "full" || raw === "reduced" || raw === "system" ? raw : DEFAULT_PREFERENCE;
    } catch {
      preference = DEFAULT_PREFERENCE;
    }
  }
  return preference;
}

export function setMotionPreference(next: MotionPreference) {
  preference = next;
  try {
    // Every value is written, including "system": with "full" as the default,
    // clearing the key would silently undo a deliberate choice to follow the OS.
    window.localStorage.setItem(STORAGE_KEY, next);
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
 * Tracks whether motion should be suppressed. GSAP and Framer effects read this
 * to stay idle rather than running infinite timelines for someone who asked not
 * to see them.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The raw setting, for the control in Settings. */
export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(subscribe, currentPreference, () => DEFAULT_PREFERENCE);
}
