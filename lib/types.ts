/** Normalised shape every tab renders. All providers are mapped into this. */
export type MediaKind = "movie" | "series";

export interface MediaItem {
  /** Stable key used for cache lookups and React keys. IMDb id when we have one. */
  key: string;
  /** IMDb id (tt…) — required to write into a Stremio library. */
  imdbId?: string;
  /** TMDB numeric id, when the item came from TMDB. */
  tmdbId?: number;
  title: string;
  kind: MediaKind;
  poster?: string;
  backdrop?: string;
  year?: string;
  /** Formatted release date, e.g. "Mar 1, 2024". */
  releaseDate?: string;
  rating?: string;
  /** How many votes the rating is based on — used to weight recommendations. */
  voteCount?: number;
  description?: string;
  director?: string;
  cast?: string;
  /** Credited people with TMDB ids, so the UI can open their profile. */
  people?: CreditedPerson[];
  genres?: string[];
  runtime?: string;
  /** YouTube video id for the trailer, when known. */
  trailerKey?: string;
}

export interface CreditedPerson {
  tmdbId: number;
  name: string;
  /** "Director", "Screenplay", or the character played. */
  role: string;
  profile?: string;
  /** Crew are listed before cast in the details modal. */
  isCrew: boolean;
}

export interface Rail {
  title: string;
  /** Optional one-line explanation of what the rail selects for. */
  blurb?: string;
  items: MediaItem[];
}

/* ---- People ---- */

export interface PersonCredit {
  key: string;
  tmdbId: number;
  title: string;
  kind: MediaKind;
  poster?: string;
  year?: string;
  releaseDate?: string;
  /** "Director", "Screenplay", or the character played. */
  role?: string;
  rating?: string;
  voteCount?: number;
}

export interface Person {
  tmdbId: number;
  name: string;
  /** "Acting", "Directing", "Writing", … */
  department?: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  profile?: string;
  imdbId?: string;
  knownFor: PersonCredit[];
  upcoming: PersonCredit[];
  filmography: PersonCredit[];
}

/* ---- Search ---- */

export interface SearchResults {
  titles: MediaItem[];
  people: {
    tmdbId: number;
    name: string;
    department?: string;
    profile?: string;
    knownFor: string;
  }[];
}

/* ---- Critic + audience scores ---- */

/** One named press critic, as summarised by the film's Wikipedia article. */
export interface CriticReview {
  /** "Manohla Dargis", "Peter Travers". */
  critic: string;
  /** The outlet they wrote for. */
  publication: string;
  /** Wikipedia's sentence about the review, quotations included. */
  excerpt: string;
  /** "4/4", "3.5/5" — only when the article states a score. */
  stars?: string;
}

export interface CriticalReception {
  /** Wikipedia article the summaries came from — shown as the credit. */
  source: string;
  sourceTitle: string;
  reviews: CriticReview[];
  rottenTomatoes?: string;
  rottenTomatoesCount?: string;
  metacritic?: string;
  metacriticCount?: string;
  /** Metacritic's own wording, e.g. "universal acclaim". */
  metacriticLabel?: string;
  /** The Rotten Tomatoes critics' consensus. */
  consensus?: string;
}

export interface Scores {
  imdb?: { value: string; votes?: string };
  rottenTomatoes?: string;
  /** How many critic reviews the RT score is based on. */
  rottenTomatoesCount?: string;
  metacritic?: string;
  metacriticCount?: string;
  metacriticLabel?: string;
  /** The Rotten Tomatoes critics' consensus, when one is published. */
  consensus?: string;
  /** Named press critics. Separate from `reviews`, which are TMDB members. */
  critics: CriticReview[];
  /** Wikipedia article `critics` was summarised from. */
  criticsSource?: string;
  criticsSourceTitle?: string;
  /** Written reviews. These are TMDB community reviewers, not press critics. */
  reviews: {
    author: string;
    rating?: number;
    content: string;
    url?: string;
    createdAt?: string;
  }[];
}

/* ---- Library sources (persisted in localStorage) ---- */

export interface StremioSource {
  type: "stremio";
  email: string;
  authKey: string;
  addedAt: number;
}

/** An IMDb list or watchlist synced by URL. */
export interface ImdbListSource {
  type: "imdb_list";
  /** The URL the user pasted, kept so the list can be refreshed later. */
  url: string;
  listKind: "list" | "watchlist";
  name: string;
  count: number;
  items: SyncItem[];
  addedAt: number;
}

/** Legacy CSV upload. Still supported — a private watchlist needs it. */
export interface ImdbCsvSource {
  type: "imdb_csv";
  filename: string;
  count: number;
  items: SyncItem[];
  addedAt: number;
}

export type Source = StremioSource | ImdbListSource | ImdbCsvSource;

/** Anything that can be written into a Stremio library. */
export interface SyncItem {
  id: string;
  title: string;
  type: MediaKind;
  year?: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  type: MediaKind;
  timestamp: number;
}

export interface SyncStats {
  added: number;
  skipped: number;
  failed: number;
  percent: number;
}
