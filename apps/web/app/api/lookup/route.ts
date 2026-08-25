import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { lookupTitles } from "@/lib/tmdb";
import type { LookupPayload, LookupTitle } from "@cinesync/shared/payloads";

export const revalidate = 600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working.
 */
export type { LookupPayload, LookupTitle };

/**
 * Titles matching a name, and nothing more about them.
 *
 * The sibling of `/api/search`, and deliberately not a mode of it. That route
 * enriches every hit — one TMDB detail request per title — because the search
 * modal shows ratings, synopses and library badges. This one answers a much
 * smaller question, "which of these did you mean", and pays a single request
 * to answer it.
 *
 * Catalogue-cached like the rest: the results are the same for everybody.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ titles: [] } satisfies LookupPayload, { headers: CATALOGUE_CACHE });
  }

  try {
    return Response.json({ titles: await lookupTitles(q) } satisfies LookupPayload, {
      headers: CATALOGUE_CACHE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
