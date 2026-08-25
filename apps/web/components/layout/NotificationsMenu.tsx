"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNotifications } from "@/lib/useNotifications";
import { useFollowing } from "@/lib/useFollowing";
import { useAppStore } from "@/store/useAppStore";
import type { AppNotification } from "@/lib/notifications";
import { Icon } from "@/components/ui/Icon";

/**
 * The bell's panel.
 *
 * Opening it marks everything read, rather than offering a separate "mark as
 * read" control. The unread count answers "is there anything I have not seen",
 * and once the list is on screen the honest answer is no.
 */
export function NotificationsMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, ready, markRead, clear } = useNotifications();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void markRead();
  }, [open, markRead]);

  // Escape and click-away. `mousedown` rather than `click`, so a press that
  // starts outside closes without also activating whatever is underneath.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          role="dialog"
          aria-label="Notifications"
          className="glass-panel absolute right-0 top-[calc(100%+12px)] z-50 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="font-title-lg text-[15px] text-on-surface">Notifications</h3>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={() => void clear()}
                className="font-label-md text-label-md text-on-surface-variant transition-colors hover:text-error"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="custom-scrollbar max-h-[calc(70vh-49px)] overflow-y-auto">
            {!ready ? (
              <p className="px-4 py-10 text-center font-label-md text-label-md text-on-surface-variant">
                Loading…
              </p>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Icon name="notifications_off" className="text-3xl text-on-surface-variant/50" />
                <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                  Nothing yet. Follow people and you&rsquo;ll hear when they gain a follower or
                  announce something.
                </p>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className="border-b border-white/5 last:border-b-0">
                    <NotificationRow notification={n} onClose={onClose} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function NotificationRow({
  notification: n,
  onClose,
}: {
  notification: AppNotification;
  onClose: () => void;
}) {
  const openPerson = useAppStore((s) => s.openPerson);
  const { isFollowing, toggle, pending } = useFollowing();

  if (n.kind === "follow") {
    const them = n.actorId;
    const following = them ? isFollowing(them) : false;

    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Icon name="person_add" className="text-[18px] text-primary" />
        </span>
        <p className="min-w-0 flex-1 font-body-md text-[14px] text-on-surface">
          <span className="font-semibold text-primary">{n.actorUsername ?? "Someone"}</span> started
          following you
          <span className="block font-label-md text-[12px] text-on-surface-variant">
            {relativeTime(n.createdAt)}
          </span>
        </p>
        {/*
           Follow back, from here. It is the only thing anyone wants to do with
           this notification, and making them go and search for the name they
           are looking at would be a strange thing to ask.
        */}
        {them ? (
          <button
            type="button"
            onClick={() => void toggle(them)}
            disabled={pending === them}
            className={`shrink-0 rounded-full px-3 py-1.5 font-label-md text-[12px] transition-colors disabled:opacity-60 ${
              following
                ? "bg-surface-container text-on-surface-variant hover:text-on-surface"
                : "bg-primary text-on-primary hover:bg-primary-fixed"
            }`}
          >
            {following ? "Following" : "Follow back"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (n.personTmdbId) openPerson(n.personTmdbId);
        onClose();
      }}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
    >
      <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-container">
        {n.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={n.poster} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-label-md text-[12px] text-primary">
          New from {n.personName}
        </span>
        <span className="block truncate font-title-lg text-[14px] text-on-surface">{n.title}</span>
        <span className="block font-label-md text-[12px] text-on-surface-variant">
          {n.releaseDate || "Date to be announced"}
        </span>
      </span>
      {!n.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
    </button>
  );
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
