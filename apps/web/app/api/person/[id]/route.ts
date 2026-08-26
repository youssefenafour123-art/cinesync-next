import { fetchPerson } from "@/lib/tmdb";
import { fetchPersonAwards } from "@/lib/wikidata";

export const revalidate = 86400;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return Response.json({ error: "Invalid person id" }, { status: 400 });
  }

  const person = await fetchPerson(tmdbId);
  if (!person) return Response.json({ error: "Person not found" }, { status: 404 });

  /*
     Awards come from Wikidata, and they have to come after TMDB rather than
     beside it: the lookup is keyed on the IMDb id, and the IMDb id is on the
     response above. Three requests deep on a cold cache, none on a warm one —
     they revalidate weekly against this route's day, because a person's award
     list changes on a ceremony's calendar and not otherwise.

     Never fatal. `fetchPersonAwards` swallows its own failures and answers
     null, so a Wikidata outage costs the badge and not the profile.
  */
  const awards = person.imdbId ? await fetchPersonAwards(person.imdbId) : null;

  return Response.json(awards ? { ...person, awards } : person);
}
