import { currentMonth, fetchCalendar, isValidMonth } from "@/lib/calendar";
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
    const entries = await fetchCalendar(month);
    return Response.json({ month, entries } satisfies CalendarPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load the calendar";
    return Response.json({ error: message }, { status: 502 });
  }
}
