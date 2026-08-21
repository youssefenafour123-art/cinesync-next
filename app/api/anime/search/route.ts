import { searchAnime } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";

export const revalidate = 600;

export interface AnimeSearchPayload {
  items: MediaItem[];
}

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
