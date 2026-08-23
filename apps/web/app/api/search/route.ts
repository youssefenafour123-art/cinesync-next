import { searchMulti } from "@/lib/tmdb";
import type { SearchResults } from "@/lib/types";

export const revalidate = 600;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return Response.json({ titles: [], people: [] } satisfies SearchResults);
  }

  try {
    return Response.json(await searchMulti(q));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
