"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Escape-to-dismiss, a scroll lock on the page behind a modal, and the
 * stacking order that decides which modal paints on top.
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

/**
 * Modals currently mounted, oldest first. Only the last entry answers Escape,
 * so one press peels exactly one layer off the stack.
 */
const stack: { close: () => void }[] = [];

const BASE_Z = 200;
let zCounter = 0;

/**
 * Returns the z-index this modal should paint at.
 *
 * A shared constant `z-[200]` made stacking depend on DOM order in `page.tsx`,
 * which is fixed — so a film opened from a person profile rendered *behind*
 * the profile, because the profile happens to be listed last. Handing out an
 * increasing z-index per mount makes whatever opened last sit on top, whatever
 * order the modals are declared in.
 */
export function useModalBehavior(onClose: () => void): number {
  const [z] = useState(() => BASE_Z + ++zCounter);

  // Kept in a ref so a new inline callback each render doesn't re-run the
  // effect — re-running it would re-order the stack and double the scroll lock.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const entry = { close: () => closeRef.current() };
    stack.push(entry);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stack[stack.length - 1] !== entry) return;
      e.stopPropagation();
      entry.close();
    };

    document.addEventListener("keydown", onKey);
    acquireLock();

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      releaseLock();
    };
  }, []);

  return z;
}
