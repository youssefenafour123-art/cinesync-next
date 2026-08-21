"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
// The server has no media queries; assume motion is fine so markup matches.
const getServerSnapshot = () => false;

/**
 * Tracks `prefers-reduced-motion`. GSAP effects read this to stay idle rather
 * than running infinite timelines for users who asked not to see them.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
