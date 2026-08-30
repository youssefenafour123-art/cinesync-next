/**
 * Where the route handlers live, and the URLs that reach them.
 *
 * The web app talks to its own origin, so every URL it builds is relative and
 * `API_BASE` is the empty string. The Expo app has no origin of its own — it
 * has to name the server — so it sets `EXPO_PUBLIC_API_BASE` and every helper
 * here returns an absolute URL instead. Nothing else in either app has to know
 * which case it is in.
 */

/**
 * Trailing slashes are stripped so `${API_BASE}/api/discover` can never come
 * out as `//api/discover`, which resolves to a protocol-relative host.
 */
function readBase(): string {
  const raw =
    // Expo inlines `EXPO_PUBLIC_*` at build time; `process.env` exists in both runtimes.
    (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_API_BASE : undefined) ?? "";
  return raw.replace(/\/+$/, "");
}

export const API_BASE = readBase();

/** `path` is the part after the origin, e.g. `/api/discover`. */
export function apiUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const query = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return `${API_BASE}${path}${query ? `?${query}` : ""}`;
}

/**
 * One entry per route handler. Callers name the endpoint rather than writing
 * the path, so a renamed route is a compile error in both apps instead of a
 * 404 discovered on a device.
 */
export const endpoints = {
  discover: () => apiUrl("/api/discover"),
  movies: () => apiUrl("/api/movies"),
  mood: (id: string) => apiUrl("/api/mood", { id }),
  anime: () => apiUrl("/api/anime"),
  animeSearch: (q: string) => apiUrl("/api/anime/search", { q }),
  arabic: (country: string, genre: string) => apiUrl("/api/arabic", { country, genre }),
  tracker: (type: "movie" | "tv") => apiUrl("/api/tracker", { type }),
  calendar: (month: string) => apiUrl("/api/calendar", { month }),
  /** Rejects below 2 characters server-side; callers should not send fewer. */
  search: (q: string) => apiUrl("/api/search", { q }),
  person: (id: number) => apiUrl(`/api/person/${id}`),
  scores: (id: string, kind: string, tmdb?: number) =>
    apiUrl(`/api/scores/${encodeURIComponent(id)}`, { kind, tmdb }),
  enrich: (params: { imdb?: string; tmdb?: number; kind?: string }) =>
    apiUrl("/api/enrich", params),
  meta: (type: string, id: string) =>
    apiUrl(`/api/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
  /** "More like this", from the IMDb id of something already watched. */
  similar: (imdb: string) => apiUrl("/api/similar", { imdb }),
  /** One genre's best titles, from the name printed on a title's genre chip. */
  genre: (name: string, kind: "movie" | "series") => apiUrl("/api/genre", { name, kind }),
  imdbList: (url: string) => apiUrl("/api/imdb-list", { url }),
  stremio: (method: string) => apiUrl(`/api/stremio/${method}`),
} as const;

/**
 * `fetch` that turns a non-2xx into a thrown `Error` carrying the handler's own
 * message. Every route answers a failure as `{ error }`, so the caller gets
 * "TMDB is unavailable" rather than "Request failed (502)" wherever the server
 * bothered to say something useful.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => null)) as T | { error?: string } | null;
  if (!res.ok) {
    const message =
      (json as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}
