import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { ARABIC_COUNTRIES, ARABIC_GENRES, arabicRails } from "@/lib/arabic";
import type { ArabicPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { ArabicPayload };

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const country = params.get("country") ?? "all";
  const genre = params.get("genre") ?? "all";

  try {
    const rails = await arabicRails(country, genre);
    return Response.json({
      countries: ARABIC_COUNTRIES,
      genres: ARABIC_GENRES,
      country,
      genre,
      rails,
    } satisfies ArabicPayload, { headers: CATALOGUE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Arabic titles";
    return Response.json({ error: message }, { status: 502 });
  }
}
