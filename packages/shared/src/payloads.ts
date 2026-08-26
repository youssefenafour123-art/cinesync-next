/**
 * The response shape of every route handler under `apps/web/app/api`.
 *
 * These used to be declared next to the handler that returned them, which is
 * the right place when only the web app reads them — the tab imported the type
 * straight from the route file. The Expo app can't do that: those modules pull
 * in `lib/tmdb.ts` and friends, which are `server-only`, so importing one for
 * its type would drag a server module into the bundle.
 *
 * So the types moved here and the route handlers re-export them. A handler
 * whose payload drifts from this file now fails to compile, which is the point
 * — the mobile app renders these shapes and has no other contract with the
 * server.
 */
import type {
  CalendarEntry,
  MediaItem,
  MediaKind,
  Rail,
  SyncItem,
} from "./types";

/** `GET /api/discover` */
export interface DiscoverPayload {
  /** Rotating hero slides — the most-watched titles right now. */
  hero: MediaItem[];
  rails: { title: string; items: MediaItem[] }[];
  /** Posters for the parallax background wall. */
  wall: string[];
}

/** `GET /api/movies` */
export interface MoviesPayload {
  rails: Rail[];
}

/** `GET /api/mood?id=` */
export interface MoodPayload {
  moods: { id: string; label: string; blurb: string }[];
  rail: Rail | null;
}

/** `GET /api/anime` */
export interface AnimePayload {
  rails: Rail[];
}

/** `GET /api/anime/search?q=` */
export interface AnimeSearchPayload {
  items: MediaItem[];
}

/** A country filter on the Arabic tab. Mirrors `apps/web/lib/arabic.ts`. */
export interface ArabicCountry {
  /** ISO 3166-1 code passed to TMDB, or "all" for the whole region. */
  id: string;
  label: string;
  /** Endonym, shown alongside the English label. */
  arabic: string;
}

/** A genre filter on the Arabic tab. Mirrors `apps/web/lib/arabic.ts`. */
export interface ArabicGenre {
  /** TMDB genre id, or "all". */
  id: string;
  label: string;
}

/** `GET /api/arabic?country=&genre=` */
export interface ArabicPayload {
  countries: ArabicCountry[];
  genres: ArabicGenre[];
  /** Echoed back so the client can confirm which selection the rails answer. */
  country: string;
  genre: string;
  rails: Rail[];
}

/** `GET /api/tracker?type=movie|tv` */
export interface TrackerPayload {
  hero: MediaItem[];
  upcoming: MediaItem[];
  released: MediaItem[];
}

/** `GET /api/calendar?month=YYYY-MM` */
export interface CalendarPayload {
  /** `YYYY-MM` the entries belong to, echoed so the client can confirm. */
  month: string;
  entries: CalendarEntry[];
}

/**
 * One candidate from `GET /api/lookup?q=` — the shape a title has before
 * anything expensive has been asked about it.
 *
 * Deliberately not a `MediaItem`. Everything in `MediaItem` beyond these five
 * fields — the IMDb id, the rating, the cast, the synopsis — comes from a
 * per-title TMDB detail request, and a search that answers "which of these
 * eight films called Arrival did you mean" needs a poster, a year and a kind
 * and nothing else. Twenty-four detail requests to render twenty-four posters
 * is what made picking a seed take ten seconds.
 */
export interface LookupTitle {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  /** Release year, absent where TMDB has no date yet. */
  year?: string;
  poster?: string;
}

/** `GET /api/lookup?q=` */
export interface LookupPayload {
  titles: LookupTitle[];
}

/** `GET /api/similar?imdb=tt…`, or `?tmdb=…&kind=…` */
export interface SimilarPayload {
  /**
   * The title the recommendations were drawn from, resolved on TMDB. Null when
   * TMDB has never heard of that IMDb id — which is an empty rail, not an
   * error, so the client can simply render nothing.
   */
  seed: {
    imdbId: string;
    tmdbId: number;
    kind: MediaKind;
    title: string;
    poster?: string;
  } | null;
  /**
   * More than the rail shows. The client drops whatever is already in the
   * viewer's library before cutting the list down, and that filter cannot run
   * here — the library lives in the browser.
   */
  items: MediaItem[];
}

/** `GET /api/runtimes?ids=tt0111161:movie:278,tt0903747:series` */
export interface TitleRuntime {
  imdbId: string;
  /**
   * How long the whole thing is, in minutes: a film's runtime, or a series'
   * entire run — every episode of every season.
   *
   * Absent titles are absent from the response rather than present with a
   * zero. TMDB has no episode runtime for a fair number of shows, and a
   * guessed forty-two minutes an episode is exactly the invented figure the
   * profile has always refused to print.
   */
  minutes: number;
  /** Series only: episodes in that run, so a finished-episodes count can move too. */
  episodes?: number;
}

export interface RuntimesPayload {
  runtimes: TitleRuntime[];
}

/** `GET /api/awards?imdb=tt…` or `?imdb=nm…` */
export interface AwardWin {
  /**
   * The category on its own — "Best Actress", not "Academy Award for Best
   * Actress". The body is already the group's heading, and repeating it on
   * every row is most of the width of the row.
   */
  category: string;
  /** Four-digit year, when the statement records one. Many do not. */
  year?: string;
  /**
   * The other half of the credit: the film or show a person won it *for*, or
   * the person who won it *for* a title. Which one it is follows from what was
   * asked about, so one field covers both.
   */
  detail?: string;
}

export interface AwardGroup {
  /** "Academy Awards", "Primetime Emmys" — already plural-matched to `wins`. */
  award: string;
  wins: AwardWin[];
}

export interface AwardsPayload {
  /** Recognised bodies only, most prestigious first. */
  groups: AwardGroup[];
  /**
   * How many further awards and honours the record holds — festival prizes,
   * critics' circles, state honours, honorary doctorates. Counted rather than
   * listed: they are the long tail that made the badge itself need filtering.
   */
  others: number;
}

/** `GET /api/gem` */
export interface GemPayload {
  /**
   * One well-regarded, little-seen title, the same one for everybody for the
   * whole week. Null when the pool came back empty, which is a card that does
   * not render rather than an error.
   */
  item: MediaItem | null;
  /** The ISO week the pick belongs to, e.g. "2026-W35". */
  week: string;
  /** When the next pick takes over: midnight UTC on the coming Monday, as an ISO string. */
  nextAt: string;
  /** Why this one — assembled from what TMDB and IMDb actually report, never written. */
  why: string;
}

/** `GET /api/imdb-list?url=` */
export interface ImdbListPayload {
  name: string;
  listKind: "list" | "watchlist";
  items: SyncItem[];
  total: number;
  truncated: boolean;
}

/** Every handler answers a failure with this and a non-2xx status. */
export interface ApiError {
  error: string;
}
