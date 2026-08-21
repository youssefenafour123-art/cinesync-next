"use client";

import { Icon } from "./Icon";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="pulsing-text flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
      <Icon name="progress_activity" className="animate-spin text-3xl text-primary" />
      <span className="font-label-md text-label-md">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Icon name="cloud_off" className="text-4xl text-error" />
      <p className="max-w-md font-body-md text-body-md text-on-surface-variant">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message, icon = "search_off" }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-on-surface-variant">
      <Icon name={icon} className="text-3xl opacity-60" />
      <p className="font-body-md text-body-md">{message}</p>
    </div>
  );
}

/** Poster-shaped shimmer used while a rail or grid loads. */
export function PosterSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[190px] shrink-0 animate-pulse">
          <div className="aspect-[2/3] rounded-[14px] bg-surface-container" />
          <div className="mt-2.5 h-3.5 w-3/4 rounded bg-surface-container" />
          <div className="mt-2 h-3 w-1/2 rounded bg-surface-container" />
        </div>
      ))}
    </>
  );
}
