"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Titles per page.
 *
 * Three rows of six on a desktop, six of three on a tablet, nine of two on a
 * phone — a screenful in every case, which is the number that matters.
 */
export const PAGE_SIZE = 18;

/** How many numbered buttons before the run is elided in the middle. */
const MAX_NUMBERS = 7;

/**
 * One shelf's worth of pagination.
 *
 * This replaces two earlier attempts, and the reason is worth keeping. First
 * the shelves rendered everything they held, which put ninety-seven posters on
 * one screen and pushed whatever followed off the bottom of the page. Then a
 * "Show all" revealed the rest in place — but everything it revealed appeared
 * below the fold, so pressing it left the screen looking identical and moved
 * the button five thousand pixels down; it was reported, correctly, as not
 * working. Pages are the honest shape for a hundred of anything: the shelf is
 * always one screenful, and moving through it is a deliberate step you can see
 * the result of.
 *
 * `page` is clamped on read rather than corrected in an effect. A list can
 * shrink underneath the pager — a removal, a different account, a filter — and
 * the arithmetic already knows the answer on the first render, where an effect
 * would need a second.
 */
export function useShelfPager(total: number, onPageChange: () => void) {
  const [requested, setRequested] = useState(1);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(requested, 1), pages);
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);

  /*
     Every page change puts the top of the shelf back on screen.

     Without it, moving from page 3 to page 4 while halfway down page 3 leaves
     you looking at the middle of a grid whose contents silently changed —
     which is the same "did that do anything?" the previous version was
     reported for.

     The scroll target belongs to the caller rather than to this hook:
     returning a ref alongside the state trips `react-hooks/refs`, which reads
     every property access on the returned object as reading a ref during
     render.
  */
  const go = useCallback(
    (next: number) => {
      setRequested(next);
      onPageChange();
    },
    [onPageChange],
  );

  return { page, pages, start, end, go };
}

/** The shelf's own scroll target, kept by the component that renders it. */
export function useShelfAnchor() {
  const anchor = useRef<HTMLDivElement>(null);
  const scrollBack = useCallback(() => {
    anchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return { anchor, scrollBack };
}

/**
 * The numbers to draw, with gaps where a run is elided.
 *
 * Always the first and last page, always the current one and its neighbours.
 * Six pages fit without eliding anything; ninety-seven titles is six pages.
 */
function numbersFor(page: number, pages: number): (number | "gap")[] {
  if (pages <= MAX_NUMBERS) return Array.from({ length: pages }, (_, i) => i + 1);

  const middle = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const out: (number | "gap")[] = [1];

  if (middle[0] !== undefined && middle[0] > 2) out.push("gap");
  out.push(...middle);
  if (middle[middle.length - 1] !== undefined && middle[middle.length - 1] < pages - 1) {
    out.push("gap");
  }
  out.push(pages);

  return out;
}

interface ShelfPagerProps {
  page: number;
  pages: number;
  /** Index of the first title on this page, zero-based. */
  start: number;
  /** Index one past the last title on this page. */
  end: number;
  total: number;
  onGo: (page: number) => void;
  /** Names the shelf for a screen reader: "Watched pages". */
  label: string;
}

export function ShelfPager({ page, pages, start, end, total, onGo, label }: ShelfPagerProps) {
  // A single page needs no way to leave it.
  if (pages <= 1) return null;

  return (
    <nav
      aria-label={`${label} pages`}
      className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/5 pt-5"
    >
      <Step icon="chevron_left" label="Previous page" disabled={page === 1} onClick={() => onGo(page - 1)} />

      {numbersFor(page, pages).map((n, i) =>
        n === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-1 font-label-md text-label-md text-on-surface-variant/50"
          >
            &hellip;
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onGo(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={`h-9 min-w-9 rounded-full px-3 font-label-md text-label-md transition-colors ${
              n === page
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            {n}
          </button>
        ),
      )}

      <Step icon="chevron_right" label="Next page" disabled={page === pages} onClick={() => onGo(page + 1)} />

      {/* The count, so the shelf says where you are without counting posters. */}
      <span className="ml-auto font-label-md text-label-md text-on-surface-variant/70">
        {start + 1}&ndash;{end} of {total}
      </span>
    </nav>
  );
}

function Step({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-container"
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}
