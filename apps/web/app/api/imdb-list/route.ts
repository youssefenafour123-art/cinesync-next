import { ImdbError, fetchImdbList, parseImdbRef } from "@/lib/imdb";
import type { ImdbListPayload } from "@cinesync/shared/payloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Declared in `packages/shared/src/payloads.ts` and re-exported here so the
 * existing `@/app/api/.../route` imports keep working. The Expo app reads it
 * from the shared package instead — it cannot import this module, which pulls
 * in `server-only` code.
 */
export type { ImdbListPayload };

/**
 * Imports an IMDb list or watchlist from its URL.
 *
 * Runs server-side because IMDb's GraphQL endpoint rejects browser origins,
 * and because their HTML is behind AWS WAF — which is why the legacy app could
 * only accept a CSV upload.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url")?.trim();
  if (!raw) {
    return Response.json({ error: "Paste an IMDb list or watchlist URL." }, { status: 400 });
  }

  const ref = parseImdbRef(raw);
  if (!ref) {
    return Response.json(
      {
        error:
          "That doesn't look like an IMDb list. Use a list URL (imdb.com/list/ls…) or a " +
          "profile watchlist URL (imdb.com/user/ur…/watchlist).",
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchImdbList(ref);
    return Response.json({
      name: result.name,
      listKind: ref.kind,
      items: result.items,
      total: result.total,
      truncated: result.truncated,
    } satisfies ImdbListPayload);
  } catch (err) {
    // ImdbError messages are written to be shown to the user as-is.
    if (err instanceof ImdbError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    return Response.json({ error: "Couldn't read that IMDb list." }, { status: 502 });
  }
}
