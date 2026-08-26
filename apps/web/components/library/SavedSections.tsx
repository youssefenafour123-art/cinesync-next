"use client";

import { useEffect, useState } from "react";
import { useWatchlist } from "@/lib/useWatchlist";
import { useWatched } from "@/lib/useWatched";
import { useLists } from "@/lib/useLists";
import type { ListSummary, SavedTitle, Visibility } from "@/lib/lists";
import { fetchListItems } from "@/lib/lists";
import {
  SavedTitleGrid,
  SavedTitleGridSkeleton,
  toMediaItem,
} from "@/components/ui/SavedTitleGrid";
import { Icon } from "@/components/ui/Icon";

/**
 * How many titles a shelf shows before it offers the rest.
 *
 * The same 18 the Stremio library section uses, and for the same reason: three
 * rows of six on a desktop is a shelf, and everything after that is a wall.
 * The watched list reached 97 titles the day it started filling itself from
 * Stremio, which is what made this necessary rather than tidy.
 */
const PAGE = 18;

/*
   Lifted out of LibraryTab so the profile screen can render the same two
   sections instead of growing its own copy.

   They are the same product surface seen from two places — the Library tab
   keeps them beside the Stremio sources, the profile keeps them behind their
   own sub-tabs — and two implementations would have disagreed the first time
   either was changed.
*/

/**
 * The account's watchlist.
 *
 * Signed-in only, and it renders nothing at all otherwise. Every other section
 * of this tab works signed out and always has, so a panel inviting an
 * anonymous visitor to sign in would push three working features down the page
 * to advertise one that isn't available yet.
 */
export function WatchlistSection() {
  const { items, ready, signedIn, toggle, pending } = useWatchlist();
  const [expanded, setExpanded] = useState(false);

  if (!signedIn) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Watchlist" count={ready ? items.length : undefined} />

      {!ready ? (
        <SavedTitleGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyShelf>Nothing saved yet. Open any title and press Watchlist to keep it here.</EmptyShelf>
      ) : (
        <>
          <SavedTitleGrid
            items={expanded ? items : items.slice(0, PAGE)}
            onRemove={(t) => void toggle(toMediaItem(t))}
            removeLabel={(t) => `Remove ${t.title} from your watchlist`}
            busy={pending}
          />
          <ShowAll count={items.length} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        </>
      )}
    </section>
  );
}

/**
 * The control that reveals the rest of a shelf.
 *
 * Renders nothing when the shelf is already showing everything — a "Show all
 * 11" under eleven posters is a control that leads nowhere.
 */
function ShowAll({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (count <= PAGE) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-6 font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
    >
      {expanded ? "Show fewer" : `Show all ${count}`}
    </button>
  );
}

/**
 * What the account has marked as seen.
 *
 * Beside the watchlist rather than replacing anything in it: the two lists are
 * independent, so a film can be on both — watched last year, queued for a
 * rewatch — and taking a title off one has never touched the other.
 */
export function WatchedSection() {
  const { items, ready, signedIn, toggle, pending } = useWatched();
  const [expanded, setExpanded] = useState(false);

  if (!signedIn) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Watched" count={ready ? items.length : undefined} />

      {!ready ? (
        <SavedTitleGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyShelf>
          Nothing marked yet. Press Watched on any title, or finish something in a connected
          Stremio account and it lands here on its own.
        </EmptyShelf>
      ) : (
        <>
          <SavedTitleGrid
            items={expanded ? items : items.slice(0, PAGE)}
            onRemove={(t) => void toggle(toMediaItem(t))}
            removeLabel={(t) => `Remove ${t.title} from your watched list`}
            removeIcon="visibility_off"
            busy={pending}
          />
          <ShowAll count={items.length} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        </>
      )}
    </section>
  );
}

/**
 * The lists the user made, each opening onto its own shelf.
 *
 * Expanding in place rather than in a modal. The details modal is already the
 * thing a poster opens, and a list opened as a modal that then opens another
 * modal on top is a stack the shell was not built for — `ModalShell` owns one
 * scroll lock and one z-index tier.
 */
export function ListsSection() {
  const { custom, ready, signedIn, create, remove, setVisibility, removeTitle, pending } =
    useLists();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!signedIn) return null;

  return (
    <section className="mb-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h3 className="font-title-lg text-title-lg text-on-surface">My Lists</h3>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex shrink-0 items-center gap-2 rounded-full bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name={creating ? "close" : "playlist_add"} className="text-[18px]" />
          {creating ? "Cancel" : "New list"}
        </button>
      </div>

      {creating ? (
        <NewListForm
          pending={pending}
          onCreate={async (name, visibility) => {
            const id = await create(name, visibility);
            if (id) setCreating(false);
            return id !== null;
          }}
        />
      ) : null}

      {!ready ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-lg bg-surface-container" />
          ))}
        </div>
      ) : custom.length === 0 ? (
        <EmptyShelf>
          No lists yet. Make one for a marathon, a genre, or the films you keep meaning to rewatch.
        </EmptyShelf>
      ) : (
        <div className="space-y-3">
          {custom.map((list) => (
            <ListRow
              key={list.id}
              list={list}
              open={openId === list.id}
              onToggleOpen={() => setOpenId((id) => (id === list.id ? null : list.id))}
              onDelete={() => void remove(list.id)}
              onVisibility={(v) => void setVisibility(list.id, v)}
              onRemoveTitle={(imdbId) => removeTitle(list.id, imdbId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h3 className="font-title-lg text-title-lg text-on-surface">{title}</h3>
      {count ? (
        <span className="shrink-0 font-label-md text-label-md text-on-surface-variant">
          {count} {count === 1 ? "title" : "titles"}
        </span>
      ) : null}
    </div>
  );
}

function EmptyShelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
      {children}
    </div>
  );
}

/** How the three visibility states are named to the person choosing one. */
const VISIBILITY: { value: Visibility; label: string; icon: string; hint: string }[] = [
  { value: "private", label: "Only me", icon: "lock", hint: "Nobody else can see this list." },
  {
    value: "followers",
    label: "Followers",
    icon: "group",
    hint: "The people who follow you can see this list.",
  },
  { value: "public", label: "Anyone", icon: "public", hint: "Anyone with your profile can see it." },
];

function ListRow({
  list,
  open,
  onToggleOpen,
  onDelete,
  onVisibility,
  onRemoveTitle,
}: {
  list: ListSummary;
  open: boolean;
  onToggleOpen: () => void;
  onDelete: () => void;
  onVisibility: (v: Visibility) => void;
  onRemoveTitle: (imdbId: string) => Promise<boolean>;
}) {
  const [items, setItems] = useState<SavedTitle[] | null>(null);
  const [armed, setArmed] = useState(false);

  /*
     Items are fetched when the row is first opened, not alongside the list
     itself. The Library tab would otherwise issue one request per list on
     every visit, to render counts it already has from the aggregate.
  */
  useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;
    void fetchListItems(list.id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, items, list.id]);

  // Arming a delete has to expire. A row left armed and forgotten turns the
  // next click on it into a deletion nobody meant this time.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const current = VISIBILITY.find((v) => v.value === list.visibility) ?? VISIBILITY[1];

  return (
    <div className="glass-card overflow-hidden rounded-lg">
      <div className="flex items-center gap-3 p-4 md:gap-4 md:p-5">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
            <Icon name="list" className="text-[22px] text-primary" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate font-body-lg text-body-lg font-semibold text-on-surface">
              {list.name}
            </h4>
            <div className="mt-1 flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
              <span>
                {list.itemCount} {list.itemCount === 1 ? "title" : "titles"}
              </span>
              <span aria-hidden>&middot;</span>
              <span className="flex items-center gap-1">
                <Icon name={current.icon} className="text-[14px]" />
                {current.label}
              </span>
            </div>
          </div>
          <Icon
            name="expand_more"
            className={`ml-auto shrink-0 text-on-surface-variant transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {/*
             A native select: three mutually exclusive states, and the platform
             already renders that correctly on a phone, with a keyboard, and to
             a screen reader.
          */}
          <label className="sr-only" htmlFor={`vis-${list.id}`}>
            Who can see {list.name}
          </label>
          <select
            id={`vis-${list.id}`}
            value={list.visibility}
            onChange={(e) => onVisibility(e.target.value as Visibility)}
            title={current.hint}
            className="rounded-full bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            {VISIBILITY.map((v) => (
              <option key={v.value} value={v.value} className="bg-surface-container text-on-surface">
                {v.label}
              </option>
            ))}
          </select>

          {/*
             Two presses to delete, and the arming expires. There is no undo
             behind this — the items go with the list, on delete cascade — and
             one mis-aimed click on a row of buttons should not be able to take
             a list with it.
          */}
          <button
            type="button"
            onClick={() => {
              if (armed) onDelete();
              else setArmed(true);
            }}
            aria-label={armed ? `Confirm deleting ${list.name}` : `Delete ${list.name}`}
            className={`rounded-full p-2 transition-colors ${
              armed
                ? "bg-error text-on-error"
                : "bg-surface-container text-on-surface-variant hover:bg-error/20 hover:text-error"
            }`}
          >
            <Icon name={armed ? "delete_forever" : "delete"} className="text-[20px]" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/10 p-4 md:p-5">
          {items === null ? (
            <SavedTitleGridSkeleton count={3} />
          ) : items.length === 0 ? (
            <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">
              This list is empty. Open a title and add it from there.
            </p>
          ) : (
            <SavedTitleGrid
              items={items}
              onRemove={(t) => {
                const before = items;
                setItems(items.filter((x) => x.imdbId !== t.imdbId));
                void onRemoveTitle(t.imdbId).then((ok) => {
                  if (!ok) setItems(before);
                });
              }}
              removeLabel={(t) => `Remove ${t.title} from ${list.name}`}
              removeIcon="playlist_remove"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function NewListForm({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (name: string, visibility: Visibility) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  // Matches the column default. A new list is shown to the people who follow
  // you, not to everyone and not to nobody.
  const [visibility, setVisibility] = useState<Visibility>("followers");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void onCreate(name, visibility).then((ok) => {
          if (ok) setName("");
        });
      }}
      className="glass-card mb-4 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name"
        maxLength={60}
        autoFocus
        aria-label="List name"
        className="min-w-0 flex-1 rounded-full bg-surface-container px-4 py-2.5 font-body-md text-body-md text-on-surface outline-none ring-primary/60 placeholder:text-on-surface-variant focus-visible:ring-2"
      />
      <select
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as Visibility)}
        aria-label="Who can see this list"
        className="rounded-full bg-surface-container px-4 py-2.5 font-label-md text-label-md text-on-surface-variant"
      >
        {VISIBILITY.map((v) => (
          <option key={v.value} value={v.value} className="bg-surface-container text-on-surface">
            {v.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="shrink-0 rounded-full bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
