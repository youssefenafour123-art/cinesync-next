"use client";

import { supabaseBrowser } from "./supabase/client";
import { clearFetchCache } from "./useFetch";

/**
 * Usernames.
 *
 * Narrow on purpose: this string is how one person finds another, so it has to
 * be typeable, comparable case-insensitively, and free of the characters that
 * make a handle ambiguous when it is spoken or pasted into a sentence.
 */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Names that must not become handles, because a person holding one could
 * impersonate the app itself or a future route.
 */
const RESERVED = new Set([
  "admin", "administrator", "api", "auth", "cinesync", "community", "discover",
  "help", "login", "logout", "me", "moderator", "official", "profile", "root",
  "settings", "signin", "signup", "staff", "support", "system", "user",
]);

export function validateUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Usernames are 3–20 characters, using letters, numbers and underscores.");
  }
  if (RESERVED.has(username)) {
    throw new Error("That username is reserved. Try another.");
  }
  return username;
}

/**
 * Whether a username is free.
 *
 * `profiles` is publicly readable, so this is a plain select rather than an
 * endpoint of its own. It exists for the error message: the unique index is
 * what actually decides, but a violation raised inside the signup trigger
 * reaches the browser as "Database error saving new user", which tells nobody
 * anything. Checking first turns that into a sentence someone can act on.
 *
 * Racy by nature — two people can pass this check at once. That is fine,
 * because the index still refuses the second one; this only moves the common
 * case to a better message.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabaseBrowser()
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  // A failed lookup must not block signup — let the index be the authority.
  if (error) return true;
  return data === null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // The response cache is keyed by URL alone, with no user dimension — so
  // without this, whatever the previous account read stays readable in memory.
  clearFetchCache();
}

export interface SignUpResult {
  /**
   * True when the account exists but no session was created, because the
   * project requires the address to be confirmed first. The caller has to say
   * so — a signup that succeeds and leaves you looking at the same form is
   * indistinguishable from one that failed.
   */
  needsConfirmation: boolean;
}

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
}): Promise<SignUpResult> {
  const username = validateUsername(input.username);

  if (!(await isUsernameAvailable(username))) {
    throw new Error(`"${username}" is taken. Try another.`);
  }

  /*
     The username rides along as user metadata rather than being written to
     `profiles` from here.

     A second client-side insert could fail on its own — a closed tab, a lost
     connection — and leave an account with no profile row and no username,
     which is an account that cannot be found or followed. The database trigger
     on `auth.users` creates the profile in the same transaction as the user,
     so either both exist or neither does.
  */
  const { data, error } = await supabaseBrowser().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { username } },
  });

  if (error) {
    // Postgres surfaces the unique index on `profiles.username` through the
    // trigger; say what the person can actually do about it.
    if (/duplicate key|already registered|unique/i.test(error.message)) {
      throw new Error("That username or email is already taken.");
    }
    throw new Error(error.message);
  }

  clearFetchCache();
  // A confirmed-on-signup project hands back a session; one that emails a link
  // hands back a user and no session.
  return { needsConfirmation: data.session === null };
}

export async function signOut(): Promise<void> {
  await supabaseBrowser().auth.signOut();
  clearFetchCache();
}
