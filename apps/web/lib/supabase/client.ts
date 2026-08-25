"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase, in the browser.
 *
 * Both variables are `NEXT_PUBLIC_` on purpose. The anon key is designed to
 * ship to clients — it identifies the project, it does not authorise anything.
 * What actually protects the data is row-level security in the database, which
 * is why every table in this app's migrations carries a policy from the
 * migration that creates it rather than one added later.
 *
 * The service-role key is the opposite: it bypasses RLS entirely. It is read
 * only in `server.ts`, and it must never gain a `NEXT_PUBLIC_` prefix — the
 * same rule the root `CLAUDE.md` states for `EXPO_PUBLIC_*`, and for the same
 * reason: that prefix inlines the value into the bundle as plaintext.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether accounts are available at all. Lets the UI say so plainly. */
export function isAuthConfigured(): boolean {
  return Boolean(url && anonKey);
}

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!url || !anonKey) {
    throw new Error(
      "Accounts aren't set up on this deployment yet — NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.",
    );
  }
  // One client per tab: each instance opens its own auth listener and token
  // refresh timer, and several of them race to write the same session cookie.
  cached ??= createBrowserClient(url, anonKey);
  return cached;
}
