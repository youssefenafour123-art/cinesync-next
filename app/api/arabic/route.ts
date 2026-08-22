import { ARABIC_COUNTRIES, ARABIC_GENRES, arabicRails } from "@/lib/arabic";
import type { ArabicCountry, ArabicGenre } from "@/lib/arabic";
import type { Rail } from "@/lib/types";

export const revalidate = 3600;

export interface ArabicPayload {
  countries: ArabicCountry[];
  genres: ArabicGenre[];
  /** Echoed back so the client can confirm which selection the rails answer. */
  country: string;
  genre: string;
  rails: Rail[];
}

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
    } satisfies ArabicPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Arabic titles";
    return Response.json({ error: message }, { status: 502 });
  }
}
