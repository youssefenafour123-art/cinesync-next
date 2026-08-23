import { fetchMeta } from "@/lib/cinemeta";
import type { MediaKind } from "@/lib/types";

export const revalidate = 3600;

/**
 * Full metadata for one title, used by the details modal to fill in the plot,
 * cast, director, genres, runtime and trailer that list endpoints don't carry.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  const kind: MediaKind = type === "series" ? "series" : "movie";

  if (!id.startsWith("tt")) {
    return Response.json({ error: "Not an IMDb id" }, { status: 400 });
  }

  const meta = await fetchMeta(kind, id);
  if (!meta) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(meta);
}
