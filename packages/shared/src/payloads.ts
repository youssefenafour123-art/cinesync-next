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

/** `GET /api/similar?imdb=tt…` */
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
