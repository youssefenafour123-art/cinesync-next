import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase inside a route handler or server component.
 *
 * Deliberately the *publishable* key, not the service role one. This client
 * acts as the signed-in user, so row-level security applies to it exactly as
 * it does in the browser — which is what makes the policies the single place
 * access is decided rather than something route handlers can forget to check.
 * The service-role key bypasses RLS entirely and nothing here needs that yet.
 *
 * Returns null when the project isn't configured, so callers can degrade
 * rather than throw during a build with no environment.
 */
export async function supabaseServer() {
  if (!url || !anonKey) return null;

  const store = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server components may not write cookies. Harmless here: the
          // middleware refreshes the session on every request, so a token
          // that could not be written back is rewritten there instead.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws. */
export async function currentUser() {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  // `getUser` revalidates the token with Supabase rather than trusting the
  // cookie's contents, which is the difference that matters on the server.
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
