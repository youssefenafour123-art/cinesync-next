"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import type { GenrePayload } from "@/app/api/genre/route";
import type { MediaItem, MediaKind } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { TitleCard } from "@/components/ui/RailGrid";
import { ErrorState } from "@/components/ui/States";
import { ModalShell } from "./ModalShell";

const NOUN: Record<MediaKind, string> = { movie: "films", series: "series" };

/** Placeholder cells while the first slice is assembled — one screen's worth. */
const SKELETONS = 8;

/**
 * One genre, opened from a genre chip on a title.
 *
 * A page rather than a filter over what is already on screen: the chip is on a
 * title in a modal, and the answer to "what else is Crime" is a different set
 * of titles, not a narrowing of the one you are reading. It stacks over the
 * details panel the way a person profile does, so closing it puts you back on
 * the film whose chip you pressed.
 *
 * The picking is `/api/genre`'s, through the same `curate` that builds the
 * curated rails — so not a raw `with_genres` dump: a vote floor, weighted
 * rating, and the titles the genre actually describes first.
 */
export function GenreModal({ name, kind }: { name: string; kind: MediaKind }) {
  const close = useAppStore((s) => s.closeGenre);

  /*
     Which catalogue to ask for, seeded by the title you came from.

     Clicking Drama on Breaking Bad should open television and clicking it on
     Heat should open film. It is a request, not a guarantee: TMDB keeps
     Thriller and Horror on the film side only, and the route answers those
     with films whatever was asked — see `answered` below.

     Initial state and nothing more: `page.tsx` keys this modal on the genre and
     the kind, so pressing a different chip on the title underneath remounts it
     rather than swapping the props. Re-seeding this in an effect would be a
     cascading render for a component that has already been rebuilt.
  */
  const [asked, setAsked] = useState<MediaKind>(kind);

  const { data, loading, error, reload } = useFetch<GenrePayload>(
    `/api/genre?name=${encodeURIComponent(name)}&kind=${asked}`,
  );

  /*
     Everything Show more has fetched, and which catalogue it belongs to.

     Tagged rather than cleared, because clearing it would mean an effect
     watching `asked` — a cascading render for something the render can just
     work out. Flipping to TV Shows makes `more.forKind` stale and the extra
     films disappear on the spot; flipping back is a cache hit on the same
     URLs, so the pages come straight back.
  */
  const [more, setMore] = useState<{ forKind: MediaKind; page: number; items: MediaItem[] }>({
    forKind: asked,
    page: 1,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /*
     The most recent slice, which is the one that knows whether another exists.
     `data` only ever describes page one, so on its own it would keep offering
     Show more after the pool had run out.
  */
  const [last, setLast] = useState<GenrePayload | null>(null);

  const mine = more.forKind === asked ? more : { forKind: asked, page: 1, items: [] };

  const showMore = useCallback(async () => {
    const next = mine.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetch(`/api/genre?name=${encodeURIComponent(name)}&kind=${asked}&page=${next}`);
      const payload = (await res.json()) as GenrePayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Couldn't load more.");
      setMore({ forKind: asked, page: next, items: [...mine.items, ...payload.items] });
      // The route decides when the pool is out, and the last slice it served
      // is the one that knows.
      setLast(payload);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [asked, mine.items, mine.page, name]);

  // Ignored once the catalogue changes underneath it, same reasoning as `mine`.
  const tail = last && last.genre?.kind === data?.genre?.kind ? last : data;

  const genre = data?.genre ?? null;
  const items = [...(data?.items ?? []), ...mine.items];

  /*
     The catalogue that actually answered, and the name TMDB filed it under.

     Both come off the response rather than off `asked` and `name`, because
     both can differ from what was requested: a chip can carry Cinemeta's IMDb
     wording, TMDB's film and television vocabularies name the same genre
     differently, and a television Thriller comes back as films because TMDB
     has no television Thriller. Reading them from the request would caption
     the page with something it is not showing.
  */
  const answered = genre?.kind ?? asked;
  const title = genre?.name ?? name;
  const substituted = Boolean(genre) && genre!.kind !== asked;
  const renamed = Boolean(genre) && genre!.name.toLowerCase() !== name.trim().toLowerCase();

  return (
    <ModalShell
      onClose={close}
      label={`${title} ${NOUN[answered]}`}
      className="glass-panel panel-glow max-w-6xl rounded-xl"
    >
      <div className="custom-scrollbar overflow-y-auto p-6 md:p-10">
        <p className="font-label-md text-label-md uppercase tracking-widest text-primary">Genre</p>
        <h1 className="mt-1 font-display-md text-headline-lg text-on-surface md:text-display-md">
          {title}
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          The best {NOUN[answered]} TMDB files under {title}, ranked by weighted rating and led by
          the ones the genre actually describes.
        </p>

        {/*
           Said out loud when the page is the nearest real one rather than the
           one that was asked for.

           Both cases are ordinary and neither is worth an error, but silently
           showing films under a chip pressed on a series — or Sci-Fi & Fantasy
           under a chip that said Science Fiction — would look like the wrong
           page rather than the closest thing to the right one.

           It says what happened and not why, because the why is not always the
           same: a chip can carry Cinemeta's IMDb wording ("Sci-Fi"), and TMDB's
           own two vocabularies can simply differ — Science Fiction on the film
           side is Sci-Fi & Fantasy on the television one. Naming one cause
           would be wrong half the time.
        */}
        {substituted || renamed ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-surface-container/40 px-4 py-3 font-body-md text-[13px] text-on-surface-variant">
            {substituted && renamed
              ? `You pressed “${name}”. TMDB files those titles under ${title}, and only on the ${answered === "movie" ? "film" : "television"} side — so these are ${NOUN[answered]}.`
              : substituted
                ? `TMDB files ${title} as a ${answered === "movie" ? "film" : "television"} genre only, so these are ${NOUN[answered]}.`
                : `You pressed “${name}”. TMDB files these titles under ${title}.`}
          </p>
        ) : null}

        {/*
           The catalogue switch, only where the genre genuinely exists on both
           sides. Crime and Drama do; Thriller and Horror do not, and a switch
           on those would lead nowhere. It always asks by the chip's original
           name, never by the resolved one, so switching back and forth cannot
           strand you: Action on the film side and Action & Adventure on the
           television side are both reachable from "Action".
        */}
        {data?.counterpart ? (
          <div className="mt-5 inline-flex gap-1 rounded-full border border-white/10 bg-surface-container/60 p-1">
            {(["movie", "series"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAsked(k)}
                aria-pressed={answered === k}
                className={`whitespace-nowrap rounded-full px-5 py-2 font-label-md text-label-md transition-colors ${
                  answered === k
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {k === "series" ? "TV Shows" : "Movies"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-8">
          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            /*
               The shape of the answer, while it is being worked out.

               A genre is assembled rather than looked up — sixty candidates
               ranked, thirty-two priced against IMDb — and the first viewer of
               a genre in any hour waits a second or two for it while everyone
               after them is served from cache in about a tenth of one. A
               spinner in an empty panel makes that read as a stall; the grid
               it is about to fill does not, and nothing moves when the posters
               arrive because the cells are already the right size.
            */
            <div
              className="grid grid-cols-2 gap-unit md:grid-cols-3 lg:grid-cols-4"
              aria-busy="true"
              aria-label={`Finding the best of ${title}`}
            >
              {Array.from({ length: SKELETONS }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[2/3] rounded border border-white/5 bg-surface-container" />
                </div>
              ))}
            </div>
          ) : !genre ? (
            /*
               A chip TMDB has no genre for at all. The wording is IMDb's, by
               way of Cinemeta, and IMDb sorts by things TMDB does not —
               Biography, Film-Noir, Sport, Short. Nothing here is broken and
               there is nothing to retry, so it says that rather than failing.
            */
            <p className="rounded-lg border border-dashed border-white/10 px-6 py-12 text-center font-body-md text-body-md text-on-surface-variant">
              TMDB doesn&rsquo;t sort titles by {name}. That chip comes from IMDb&rsquo;s list of
              genres, which is the longer of the two — there is no page to show behind it.
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-6 py-12 text-center font-body-md text-body-md text-on-surface-variant">
              Nothing in {title} clears the bar on the{" "}
              {answered === "series" ? "television" : "film"} side — the genre exists, but TMDB has
              too few well-rated titles in it to fill a page.
            </p>
          ) : (
            <motion.div
              key={`${title}-${answered}`}
              className="grid grid-cols-2 gap-unit md:grid-cols-3 lg:grid-cols-4"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              initial="hidden"
              animate="show"
            >
              {items.map((item) => (
                <TitleCard key={item.key} item={item} />
              ))}
            </motion.div>
          )}

          {/*
             More of the same genre, further down the same ranking — the route
             reads on from where this slice stopped rather than re-sorting a
             wider pool, so nothing already on screen moves.

             Fetched on the press and not before. Most people never ask, and
             the whole point of the work above was to stop the page paying for
             titles nobody looked at.
          */}
          {genre && items.length > 0 && tail?.hasMore ? (
            <div className="mt-8 flex flex-col items-center gap-3">
              {moreError ? (
                <p className="font-body-md text-[13px] text-error">{moreError}</p>
              ) : null}
              <button
                type="button"
                onClick={showMore}
                disabled={loadingMore}
                className="rounded-full border border-white/10 bg-surface-container/60 px-7 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary/40 hover:text-on-surface disabled:opacity-60"
              >
                {loadingMore ? "Finding more…" : moreError ? "Try again" : "Show more"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
