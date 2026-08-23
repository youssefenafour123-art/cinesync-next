import { searchAnime } from "@/lib/tmdb";
import type { AnimeSearchPayload } from "@cinesync/shared/payloads";

export const revalidate = 600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { AnimeSearchPayload };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ items: [] } satisfies AnimeSearchPayload);

  try {
    const items = await searchAnime(q);
    return Response.json({ items } satisfies AnimeSearchPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
