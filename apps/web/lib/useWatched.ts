"use client";

import { createSystemListStore } from "./systemList";

/**
 * What the account has actually seen.
 *
 * The watchlist's opposite number, and deliberately not derived from it:
 * marking something watched does not take it off the watchlist, because
 * plenty of people keep a record of what they have seen and a queue of what
 * they mean to see, and a title can honestly be on both — rewatches are a
 * thing. The details modal offers the two as separate presses for that reason.
 */
const watched = createSystemListStore("is_watched", {
  signedOut: "Sign in to keep track of what you've watched.",
  missing: "Couldn't find your watched list. Try reloading.",
});

export const useWatched = watched.use;
export const resetWatched = watched.reset;
