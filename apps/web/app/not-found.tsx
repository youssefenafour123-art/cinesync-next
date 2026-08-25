import Link from "next/link";

/**
 * Any address that isn't `/`.
 *
 * The app is a single route, so every mistyped URL, every stale link and every
 * crawler guessing at `/movies` lands here. Next's built-in 404 is black text
 * on a white page, which after a dark app reads as having left the site
 * entirely — and it offers no way back.
 *
 * A server component: there is nothing interactive here, and a 404 should not
 * cost a JavaScript bundle to render.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-container-max flex-col items-center justify-center px-margin-mobile text-center md:px-margin-desktop">
      <span className="material-symbols-outlined text-primary" style={{ fontSize: 56 }}>
        travel_explore
      </span>

      <h1 className="mt-4 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
        Nothing lives here
      </h1>
      <p className="mt-2 max-w-prose font-body-md text-body-md text-on-surface-variant">
        CineSync is one page — the tabs, titles and profiles are all on it. Whatever brought you to
        this address, it isn&rsquo;t a place in the app.
      </p>

      <Link
        href="/"
        className="mt-8 rounded-full bg-primary px-6 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed"
      >
        Go to CineSync
      </Link>
    </main>
  );
}
