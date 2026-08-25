"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLists } from "@/lib/useLists";
import { fetchListsHolding, toSavedTitle } from "@/lib/lists";
import type { MediaItem } from "@/lib/types";
import { Icon } from "./Icon";

/**
 * "Add to list", as a disclosure rather than a menu.
 *
 * It expands in place under the button. A floating popover would have to
 * escape `ModalShell`'s overflow and win against its z-index tier, and the
 * column it sits in is narrow enough that there is nowhere for a popover to
 * go that is not on top of the poster.
 *
 * Signed out it renders nothing, matching the watchlist button beside it.
 */
export function AddToList({ item }: { item: MediaItem }) {
  const { custom, ready, signedIn, create, addTitle, removeTitle } = useLists();
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const imdbId = item.imdbId;

  /*
     Membership is read when the panel opens, not with the lists.

     A details modal is opened far more often than this panel is, and the
     answer is per title — caching it across titles would be a cache to
     invalidate on every add, for a query that costs one round trip.
  */
  /*
     Depended on as a joined string, not as the array.

     `custom` is derived with a `filter` on every render, so it is a new array
     every time — as a dependency it would re-run this effect on each render
     and fire a second request before the first had come back to set `holding`.
  */
  const listIds = custom.map((l) => l.id).join(",");

  useEffect(() => {
    if (!open || !imdbId || holding !== null) return;
    let cancelled = false;
    void fetchListsHolding(imdbId, listIds ? listIds.split(",") : [])
      .then((s) => {
        if (!cancelled) setHolding(s);
      })
      .catch(() => {
        if (!cancelled) setHolding(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [open, imdbId, holding, listIds]);

  if (!signedIn) return null;

  const toggleList = async (listId: string) => {
    if (!imdbId || busy) return;
    const inIt = holding?.has(listId) ?? false;

    let title;
    try {
      title = toSavedTitle(item);
    } catch {
      return;
    }

    // Optimistic, and put back by the hook's own rollback if the write is
    // refused — `addTitle`/`removeTitle` report their own failure.
    setHolding((prev) => {
      const next = new Set(prev ?? []);
      if (inIt) next.delete(listId);
      else next.add(listId);
      return next;
    });
    setBusy(listId);

    const ok = inIt ? await removeTitle(listId, imdbId) : await addTitle(listId, title);
    if (!ok) {
      setHolding((prev) => {
        const next = new Set(prev ?? []);
        if (inIt) next.add(listId);
        else next.delete(listId);
        return next;
      });
    }
    setBusy(null);
  };

  /**
   * Makes a list and puts this title in it.
   *
   * `create` hands back the id precisely so this can follow it without having
   * to find the row again — two lists can share a name, so searching by name
   * would sometimes add the title to the wrong one.
   */
  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || !imdbId) return;

    let title;
    try {
      title = toSavedTitle(item);
    } catch {
      return;
    }

    setNewName("");
    const id = await create(name, "followers");
    if (!id) return;

    setHolding((prev) => new Set(prev ?? []).add(id));
    const ok = await addTitle(id, title);
    if (!ok) {
      setHolding((prev) => {
        const next = new Set(prev ?? []);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!imdbId}
        aria-expanded={open}
        title={imdbId ? undefined : "This title has no IMDb ID yet"}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary/40 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="playlist_add" className="text-[18px]" />
        Add to list
        <Icon
          name="expand_more"
          className={`text-[18px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-2xl border border-white/10 bg-surface-container/60 p-2">
              {!ready ? (
                <p className="px-2 py-3 text-center font-label-md text-label-md text-on-surface-variant">
                  Loading…
                </p>
              ) : custom.length === 0 ? (
                <p className="px-2 py-3 text-center font-label-md text-label-md text-on-surface-variant">
                  You have no lists yet.
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {custom.map((l) => {
                    const inIt = holding?.has(l.id) ?? false;
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => void toggleList(l.id)}
                          disabled={busy !== null}
                          aria-pressed={inIt}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-label-md text-label-md transition-colors disabled:opacity-60 ${
                            inIt
                              ? "text-primary hover:bg-primary/10"
                              : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                          }`}
                        >
                          <Icon
                            name={
                              busy === l.id
                                ? "progress_activity"
                                : inIt
                                  ? "check_circle"
                                  : "radio_button_unchecked"
                            }
                            fill={inIt}
                            className={`text-[18px] ${busy === l.id ? "animate-spin" : ""}`}
                          />
                          <span className="min-w-0 flex-1 truncate">{l.name}</span>
                          <span className="shrink-0 opacity-60">{l.itemCount}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/*
                 Making a list and putting the title in it is one action here.
                 Sending someone to the Library tab to create a list, then back
                 to find the title again, is the flow this replaces.
              */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void createAndAdd();
                }}
                className="mt-1 flex items-center gap-2 border-t border-white/10 px-1 pt-2"
              >
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New list…"
                  maxLength={60}
                  aria-label="Name for a new list"
                  className="min-w-0 flex-1 rounded-full bg-surface-container px-3 py-2 font-body-md text-[14px] text-on-surface outline-none ring-primary/60 placeholder:text-on-surface-variant focus-visible:ring-2"
                />
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  aria-label="Create list and add this title"
                  className="shrink-0 rounded-full bg-primary p-2 text-on-primary transition-colors hover:bg-primary-fixed disabled:opacity-50"
                >
                  <Icon name="add" className="text-[18px]" />
                </button>
              </form>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
