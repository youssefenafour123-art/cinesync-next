"use client";

import { useEffect } from "react";

/**
 * What a visitor sees when the app throws.
 *
 * Without this file, a render error anywhere in the tree unmounts the whole
 * app and Next serves its own message on a white page — which for an app that
 * is one route means a thrown error in any tab takes down every tab, and the
 * only way back is for someone to guess that reloading might help.
 *
 * `reset()` re-renders the tree in place, which is enough for the errors this
 * app can actually produce: a poster payload that came back malformed, a modal
 * that opened on a title with a missing field. The reload beside it is for
 * when it isn't.
 *
 * Styled with the app's own tokens rather than Next's default, because a
 * failure screen that looks like a different website reads as "this site is
 * broken" rather than "that page didn't load".
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The only reporting this project has. A digest is what Vercel's logs key
    // the server-side stack on, so it is worth printing next to the message.
    console.error("[cinesync] unhandled error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-container-max flex-col items-center justify-center px-margin-mobile text-center md:px-margin-desktop">
      <span className="material-symbols-outlined text-primary" style={{ fontSize: 56 }}>
        error
      </span>

      <h1 className="mt-4 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
        That didn&rsquo;t load
      </h1>
      <p className="mt-2 max-w-prose font-body-md text-body-md text-on-surface-variant">
        Something went wrong rendering this screen. Nothing you saved is affected — your watchlist,
        lists and top fives all live on the server.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-6 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/10 px-6 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary/40 hover:text-on-surface"
        >
          Reload the page
        </button>
      </div>

      {error.digest ? (
        <p className="mt-6 font-label-md text-[12px] text-on-surface-variant/60">
          Reference {error.digest}
        </p>
      ) : null}
    </main>
  );
}
