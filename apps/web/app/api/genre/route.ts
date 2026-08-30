import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { curate, genreCatalogue } from "@/lib/tmdb";
import type { GenrePayload } from "@cinesync/shared/payloads";
import type { MediaKind } from "@/lib/types";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { GenrePayload };

/** Titles one slice of a genre page holds. Same pool as a mood rail. */
const LIMIT = 24;
/** TMDB discover pages read per slice. 60 candidates for a shortlist of 32. */
const TMDB_PAGES = 3;
/**
 * How far "Show more" will go: 72 titles, three presses.
 *
 * A bound rather than an open feed, and it is a caching decision as much as an
 * editorial one. `/api/mood` documents the trap — a free `?size=` or `?page=`
 * multiplies the cache entries behind every genre by every value anyone can
 * type. Three fixed slices is 105 possible responses across the whole genre
 * catalogue, which is a cache; unbounded paging is not.
 *
 * Three is also about where the answer stops being one. Ranked by weighted
 * rating inside a vote floor, the seventy-third best film in a genre is no
 * longer a recommendation, it is a list.
 */
const MAX_PAGE = 3;

/**
 * The quality bar, per catalogue.
 *
 * Split for the reason `Mood.tv` documents: a series accumulates far fewer
 * votes than a film with the same audience, so reusing the film floors against
 * television returns a handful of results and calls it a genre. These are the
 * floors the genre-led moods already use — Crime asks 800 votes of a film and
 * 200 of a show — because a genre page is that rail without the editorial
 * framing.
 */
const BARS = {
  movie: { votes: "800", minVotes: 500 },
  series: { votes: "200", minVotes: 350 },
} as const;

/**
 * What a genre chip says, against what TMDB calls the same thing.
 *
 * The chips are `item.genres`, and `/api/enrich` takes those from Cinemeta
 * where it has them — Cinemeta speaks IMDb's vocabulary, TMDB speaks its own,
 * and on television the two barely overlap. Without this table the most
 * ordinary chip on the app fails to resolve: Breaking Bad's genres come back as
 * Crime, Drama and **Thriller**, and TMDB has no television genre by that name.
 *
 * Only where one name is genuinely the other's. TMDB's television catalogue
 * folds action into `Action & Adventure` and science fiction into
 * `Sci-Fi & Fantasy` — those *are* its names for those genres, so the mapping
 * states a fact rather than a preference. Where TMDB has nothing at all —
 * IMDb's Biography, Film-Noir, Sport, Short — nothing is invented; see the null
 * case below.
 */
const ALIASES: Record<MediaKind, Record<string, string>> = {
  movie: {
    "sci-fi": "Science Fiction",
    musical: "Music",
  },
  series: {
    action: "Action & Adventure",
    adventure: "Action & Adventure",
    "sci-fi": "Sci-Fi & Fantasy",
    "science fiction": "Sci-Fi & Fantasy",
    fantasy: "Sci-Fi & Fantasy",
    war: "War & Politics",
    musical: "Music",
  },
};

/** The chip's name, resolved against one catalogue's vocabulary. */
function resolve(name: string, kind: MediaKind, catalogue: { id: number; name: string }[]) {
  const wanted = name.trim().toLowerCase();
  const alias = ALIASES[kind][wanted]?.toLowerCase();
  return (
    catalogue.find((g) => g.name.toLowerCase() === wanted) ??
    (alias ? catalogue.find((g) => g.name.toLowerCase() === alias) : undefined)
  );
}

/**
 * One genre's best titles, asked for by the name printed on a title's chip.
 *
 * By name and not by id, because a chip only ever has the name — `enrich`
 * writes `item.genres` as strings and never keeps the ids. Resolving it here
 * costs one cached request and spares every caller a lookup table that would
 * drift; see `genreCatalogue`.
 *
 * The requested catalogue is a preference, not a requirement. A chip on a
 * series says which vocabulary to try first, and when TMDB does not keep the
 * genre there — Thriller and Horror are film-only — the film catalogue answers
 * instead and the payload says so, because Thriller films are a real answer to
 * pressing Thriller and an error is not.
 *
 * Cached publicly for an hour. Nothing personal reaches this route: the name
 * and the catalogue are the whole request, so every viewer browsing Crime
 * shares one entry.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const name = params.get("name")?.trim() ?? "";
  const asked: MediaKind = params.get("kind") === "series" ? "series" : "movie";
  // Clamped rather than rejected: a page past the end is a client that has
  // lost count, and the honest answer is the last slice, not a 400.
  const page = Math.min(Math.max(Number(params.get("page")) || 1, 1), MAX_PAGE);

  if (!name) {
    return Response.json({ error: "Pass ?name=Thriller&kind=movie" }, { status: 400 });
  }

  const other: MediaKind = asked === "movie" ? "series" : "movie";

  try {
    // Both vocabularies, because the answer has to know whether this genre
    // exists on the other side either way. Two cached requests, run together.
    const [ownList, otherList] = await Promise.all([
      genreCatalogue(asked),
      genreCatalogue(other),
    ]);

    const own = resolve(name, asked, ownList);
    const across = resolve(name, other, otherList);

    /*
       A name in neither vocabulary is an empty page, not an error.

       IMDb files Biography, Film-Noir, Sport and Short; TMDB files none of
       them, and Cinemeta's chips use IMDb's list. There is nothing wrong with
       the request and nothing to retry — the honest answer is to say that TMDB
       does not sort titles that way, which is what the client renders when
       `genre` is null.
    */
    if (!own && !across) {
      return Response.json(
        { genre: null, counterpart: null, items: [], page, hasMore: false } satisfies GenrePayload,
        { headers: CATALOGUE_CACHE },
      );
    }

    // The catalogue that actually answered, and the one left over.
    const kind: MediaKind = own ? asked : other;
    const genre = (own ?? across)!;
    const twin = own ? across : undefined;

    const bar = BARS[kind];
    const items = await curate(
      kind === "movie" ? "movie" : "tv",
      {
        with_genres: String(genre.id),
        "vote_count.gte": bar.votes,
        sort_by: "vote_average.desc",
      },
      {
        minVotes: bar.minVotes,
        limit: LIMIT,
        pages: TMDB_PAGES,
        firstPage: (page - 1) * TMDB_PAGES + 1,
        shortlist: 32,
        /*
           Titles the genre actually describes, first.

           `with_genres` matches membership, and membership is generous — Pulp
           Fiction is a Thriller by TMDB's reckoning. `leadGenre` tiers the
           result so the page opens with the titles this genre leads for and
           only reaches past them when it would otherwise come up short. It is
           the whole reason a genre page is worth more than a filter.
        */
        leadGenre: genre.name,
      },
    );

    return Response.json(
      {
        genre: { id: genre.id, name: genre.name, kind },
        counterpart: twin ? { id: twin.id, name: twin.name, kind: other } : null,
        items,
        page,
        // A short slice means the pool under the vote floor ran out, which is
        // the end of the genre whatever `MAX_PAGE` says.
        hasMore: page < MAX_PAGE && items.length === LIMIT,
      } satisfies GenrePayload,
      { headers: CATALOGUE_CACHE },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load that genre";
    return Response.json({ error: message }, { status: 502 });
  }
}
