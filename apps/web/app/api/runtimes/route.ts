import { titleRuntimes, type RuntimeRef } from "@/lib/tmdb";
import type { MediaKind } from "@/lib/types";
import type { RuntimesPayload, TitleRuntime } from "@cinesync/shared/payloads";

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` import style keeps working.
 */
export type { RuntimesPayload, TitleRuntime };

/**
 * How many titles one request may ask about.
 *
 * A watched list this size is already unusual, and the cap is what stops a
 * crafted URL turning into two hundred TMDB requests. The client chunks
 * anything longer.
 */
const MAX_IDS = 120;

/**
 * How long the titles in a watched list are.
 *
 * The profile can now count time for something the viewer marked watched by
 * hand rather than played in Stremio, and this is where that length comes
 * from — TMDB's runtime for a film, the full run for a series.
 *
 * **Not** CDN-cached, unlike every other catalogue route here. What comes back
 * is public knowledge and identical for everybody, so a shared cache would be
 * safe on the response — but the *request* is a list of IMDb ids belonging to
 * one person, and `s-maxage` would leave that list sitting in an edge cache
 * key for a day. `lib/lists.ts` makes the same argument about route handlers
 * and per-user data: the safe way to handle a sharp mechanism is not to be
 * careful with it, it is not to reach for it.
 *
 * Nothing is lost by that. The expensive half is the TMDB calls, and those are
 * cached for a day inside `titleRuntimes` by Next's own data cache, which is
 * keyed per upstream URL and so is shared across everybody regardless.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids")?.trim() ?? "";
  const refs = parseRefs(raw);

  if (refs.length === 0) {
    return Response.json({ runtimes: [] } satisfies RuntimesPayload, { headers: PRIVATE });
  }

  try {
    const runtimes = await titleRuntimes(refs);
    return Response.json({ runtimes } satisfies RuntimesPayload, { headers: PRIVATE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read runtimes";
    return Response.json({ error: message }, { status: 502 });
  }
}

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

/**
 * `tt0111161:movie:278,tt0903747:series` → refs.
 *
 * Colon-separated because neither an IMDb id nor a kind can contain one, so
 * the split needs no escaping. The TMDB id is optional: titles that reached
 * the watched list through the Stremio sync carry an IMDb id and nothing else.
 */
function parseRefs(raw: string): RuntimeRef[] {
  const seen = new Set<string>();
  const refs: RuntimeRef[] = [];

  for (const part of raw.split(",")) {
    const [imdbId, kindRaw, tmdbRaw] = part.split(":");
    if (!/^tt\d+$/.test(imdbId ?? "") || seen.has(imdbId)) continue;
    seen.add(imdbId);

    const kind: MediaKind = kindRaw === "series" ? "series" : "movie";
    const tmdbId = Number(tmdbRaw);

    refs.push({
      imdbId,
      kind,
      tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : undefined,
    });

    if (refs.length >= MAX_IDS) break;
  }

  return refs;
}
