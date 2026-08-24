import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { recommendationsFor } from "@/lib/tmdb";
import type { SimilarPayload } from "@cinesync/shared/payloads";

export const revalidate = 86400;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { SimilarPayload };

/**
 * "More like this", for one IMDb id.
 *
 * Cached publicly and for a day, which is safe *because of what it does not
 * take*: the seed is an IMDb id and nothing else. The rail this feeds is
 * personal — it is seeded by the last thing the viewer played — but the
 * personal half never leaves the browser, and two people who watched the same
 * film can share one cache entry.
 */
export async function GET(req: Request) {
  const imdb = new URL(req.url).searchParams.get("imdb")?.trim() ?? "";

  if (!/^tt\d+$/.test(imdb)) {
    return Response.json({ error: "Pass an IMDb id, e.g. ?imdb=tt4540710" }, { status: 400 });
  }

  try {
    const { seed, items } = await recommendationsFor(imdb);
    // A seed TMDB has never heard of is an empty rail, not a failure: the
    // client renders nothing and the viewer is never told about an id they
    // did not type.
    return Response.json({ seed, items } satisfies SimilarPayload, { headers: CATALOGUE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't find anything similar";
    return Response.json({ error: message }, { status: 502 });
  }
}
