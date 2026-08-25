"use client";

import { createSystemListStore } from "./systemList";

/**
 * The signed-in user's watchlist, held once for the whole app.
 *
 * The implementation is `createSystemListStore` — see there for why the store
 * lives at module scope. The watchlist and the watched list are the same
 * mechanism with a different flag on the `lists` row, so they share it rather
 * than being two copies that have to be kept identical by hand.
 */
const watchlist = createSystemListStore("is_watchlist", {
  signedOut: "Sign in to keep a watchlist.",
  missing: "Couldn't find your watchlist. Try reloading.",
});

export const useWatchlist = watchlist.use;
export const resetWatchlist = watchlist.reset;
