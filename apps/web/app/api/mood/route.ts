import { MOODS, curate, findMood } from "@/lib/tmdb";
import type { MoodPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { MoodPayload };

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? MOODS[0].id;
  const mood = findMood(id);

  const catalogue = MOODS.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb }));

  if (!mood) {
    return Response.json({ moods: catalogue, rail: null } satisfies MoodPayload);
  }

  try {
    const items = await curate(
      "movie",
      { ...mood.params, sort_by: "vote_average.desc" },
      { minVotes: mood.minVotes ?? 800, floor: mood.floor ?? 6.6, limit: 12, pages: 2 },
    );

    return Response.json({
      moods: catalogue,
      rail: { title: mood.label, blurb: mood.blurb, items },
    } satisfies MoodPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load that mood";
    return Response.json({ error: message }, { status: 502 });
  }
}
