import { currentMonth, fetchCalendar, isValidMonth } from "@/lib/calendar";
import type { CalendarEntry } from "@/lib/types";

export const revalidate = 3600;

export interface CalendarPayload {
  /** `YYYY-MM` the entries belong to, echoed so the client can confirm. */
  month: string;
  entries: CalendarEntry[];
}

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
