import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Keeps the session alive.
 *
 * Supabase access tokens are short-lived. The browser client refreshes its own
 * while a tab is open, but a session that lives in cookies also has to be
 * refreshed on the way through the server, or a returning visitor arrives with
 * an expired token and is silently signed out.
 *
 * This gates nothing. Every catalogue route stays public and anonymous
 * browsing is unchanged — Discover, Curated, the genre rails and the rest work
 * signed out exactly as before. All this does is renew a cookie when there is
 * one to renew.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Not configured: behave as though this file weren't here.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // The call itself is the point: it refreshes an expiring token and, through
  // `setAll` above, writes the new one onto the response.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /*
     Pages and the auth callback. Not `/api/*`, and not static assets.

     `/api/*` used to be in here, for authenticated route handlers that were
     coming later. They never came: every user-owned read and write goes
     straight to Supabase under row-level security, and the only route that
     authenticates anything — the Stremio relay — carries its own authKey and
     has never looked at these cookies.

     Meanwhile `getUser()` above is a network call to Supabase's auth server,
     so every catalogue request was paying for a session refresh that nothing
     downstream read. Ten of those fire on a first load. The session is still
     refreshed on the way to the page itself, which is the request that
     actually renders a signed-in view.
  */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
