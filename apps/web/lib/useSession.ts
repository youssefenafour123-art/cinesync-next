"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isAuthConfigured, supabaseBrowser } from "./supabase/client";
import { clearFetchCache } from "./useFetch";

export interface SessionState {
  user: User | null;
  /** The handle from signup metadata, before the profile row is read. */
  username: string | null;
  /** False until the first answer arrives, so the UI can avoid flashing "sign in". */
  ready: boolean;
}

/**
 * Who is signed in, live.
 *
 * `onAuthStateChange` rather than a one-off read, because a session can begin
 * or end without this component doing anything: the confirmation link opens a
 * second tab, a token expires, another tab signs out. All of those have to
 * reach the nav.
 *
 * The cache flush on change is the same hazard `lib/auth.ts` handles for the
 * explicit sign-in and sign-out paths, caught here for the ones nothing in
 * this app initiated.
 */
export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!isAuthConfigured());

  useEffect(() => {
    if (!isAuthConfigured()) return;

    const supabase = supabaseBrowser();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setReady(true);
      // INITIAL_SESSION is the listener reporting what was already there, not
      // a change — flushing on it would throw away the cache on every mount.
      if (event !== "INITIAL_SESSION") clearFetchCache();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    username: (user?.user_metadata?.username as string | undefined) ?? null,
    ready,
  };
}
