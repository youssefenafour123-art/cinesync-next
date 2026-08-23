import { fetchPerson } from "@/lib/tmdb";

export const revalidate = 86400;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return Response.json({ error: "Invalid person id" }, { status: 400 });
  }

  const person = await fetchPerson(tmdbId);
  if (!person) return Response.json({ error: "Person not found" }, { status: 404 });

  return Response.json(person);
}
