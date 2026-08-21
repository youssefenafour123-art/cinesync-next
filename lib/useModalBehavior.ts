"use client";

import { useEffect } from "react";

/**
 * Escape-to-dismiss plus a scroll lock on the page behind a modal.
 *
 * Shared by every modal so the behaviour can't drift between them — the legacy
 * page had two different `closeTrailer` implementations that disagreed about
 * whether to clear the iframe, and the trailer overlay had no Escape handling
 * at all.
 *
 * The lock is a reference count, not a save/restore of the previous value.
 * Modals do not always unmount in the order they mounted: opening a person
 * profile from search closes the search modal *first*, so a naive restore
 * would unlock the page while the profile was still open, then re-apply
 * `hidden` on the profile's own cleanup — leaving the page permanently
 * unscrollable.
 *
 * The lock lives on <html>, not <body>: body already carries
 * `overflow-x-hidden`, and writing `overflow` there resolves to
 * "hidden auto", which doesn't lock vertical scrolling.
 */
let lockCount = 0;
let restoreOverflow = "";
let restorePadding = "";

function acquireLock() {
  const root = document.documentElement;
  if (lockCount === 0) {
    restoreOverflow = root.style.overflow;
    restorePadding = root.style.paddingRight;
    // Compensate for the vanishing scrollbar so the layout doesn't jump.
    const gap = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    if (gap > 0) root.style.paddingRight = `${gap}px`;
  }
  lockCount++;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    const root = document.documentElement;
    root.style.overflow = restoreOverflow;
    root.style.paddingRight = restorePadding;
  }
}

export function useModalBehavior(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    acquireLock();

    return () => {
      document.removeEventListener("keydown", onKey);
      releaseLock();
    };
  }, [onClose]);
}
