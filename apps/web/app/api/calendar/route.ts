import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { currentMonth, fetchCalendar, isValidMonth } from "@/lib/calendar";
import { withCommunityPosters } from "@/lib/tmdb";
import type { CalendarPayload } from "@cinesync/shared/payloads";

export const revalidate = 3600;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { CalendarPayload };

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get("month");
  const month = isValidMonth(requested) ? requested : currentMonth();

  try {
    /*
       Community artwork here too, so a title looks the same on the calendar as
       it does on the rail that sent you there. `fetchCalendar` builds from
       TMDB's `poster_path`, which is the official sheet by definition.

       Affordable because the lookups are memoised by tmdbId and a month's
       entries repeat: a series appears once per air date, so a show with eight
       episodes in the month costs one request, not eight.
    */
    const entries = await withCommunityPosters(await fetchCalendar(month));
    return Response.json({ month, entries } satisfies CalendarPayload, {
      headers: CATALOGUE_CACHE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load the calendar";
    return Response.json({ error: message }, { status: 502 });
  }
}
