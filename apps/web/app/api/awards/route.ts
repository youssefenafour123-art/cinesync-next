import { CATALOGUE_CACHE } from "@/lib/httpCache";
import { fetchAwardDetail } from "@/lib/wikidata";
import type { AwardGroup, AwardWin, AwardsPayload } from "@cinesync/shared/payloads";

export const revalidate = 604800;

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` import style keeps working.
 */
export type { AwardGroup, AwardWin, AwardsPayload };

/**
 * Every recognised award one title or one person has won, itemised.
 *
 * A route of its own rather than more fields on the two badges, because the
 * badges are cheap and this is not: three Wikidata calls plus a second round
 * of label lookups for the qualifiers, on a panel almost nobody opens. Paying
 * that on every details modal and every person profile would be the same
 * mistake `titleRuntimes` exists to avoid on the other side of the app.
 *
 * One handler for both kinds because Wikidata models them the same way — P345
 * identifies a film or an actor equally, and `award received` hangs off either.
 * The `tt`/`nm` prefix is the only thing that differs, and `fetchAwardDetail`
 * reads it.
 *
 * Catalogue-cached: what a film won is the same fact for everybody, and unlike
 * `/api/runtimes` the id in the URL is one public title or person rather than
 * a list describing the person who asked.
 */
export async function GET(req: Request) {
  const imdbId = new URL(req.url).searchParams.get("imdb")?.trim() ?? "";

  if (!/^(tt|nm)\d+$/.test(imdbId)) {
    return Response.json({ error: "An IMDb title or name id is required" }, { status: 400 });
  }

  /*
     An empty result is a 200, not a 404.

     Plenty of titles and people have no Wikidata item, or none of the awards
     this names — that is an ordinary answer to an ordinary question, and the
     panel renders "nothing recorded" rather than an error. `fetchAwardDetail`
     swallows its own network failures for the same reason, so a Wikidata
     outage reads as "nothing recorded" too. That is the one dishonest edge
     here, and it is the same trade every other optional source in this app
     makes.
  */
  const payload: AwardsPayload = await fetchAwardDetail(imdbId);
  return Response.json(payload, { headers: CATALOGUE_CACHE });
}
