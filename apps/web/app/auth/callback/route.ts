import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Where a confirmation or password-reset link lands.
 *
 * Supabase's email link goes to its own `/auth/v1/verify`, which validates the
 * token and then redirects here with a `code`. That code is not a session — it
 * has to be exchanged for one, and the exchange is what writes the session
 * cookies. Without this route the link arrived at the app, the app ignored the
 * query string, and a correctly confirmed account looked like a failed signup:
 * the page simply opened, signed out.
 *
 * The exchange is done server-side so the cookies come back `HttpOnly` from
 * the same response that redirects, rather than being written by script.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Supabase reports a rejected link — expired, or already used — by
  // redirecting here with an error rather than a code. Say which.
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent("That link is missing its code.")}`);
  }

  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent("Accounts aren't configured on this deployment.")}`,
    );
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(exchangeError.message)}`);
  }

  /*
     `next` is echoed from the query string, so it has to resolve to this
     origin and nowhere else — an open redirect on the route that hands out
     sessions is worth being careful about.

     Resolved through `URL` rather than string-matched. The previous check was
     `startsWith("/") && !startsWith("//")`, which reads correctly and misses
     `/\evil.com`: browsers normalise a backslash to a forward slash in the
     authority position, so that arrives as `//evil.com` and is protocol-
     relative. Parsing it against the origin and comparing what comes out
     cannot be fooled by whichever character a browser decides to fold next.
  */
  let safeNext = "/";
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin === origin) safeNext = `${resolved.pathname}${resolved.search}`;
  } catch {
    // A `next` that will not parse is one we are not going to follow.
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
