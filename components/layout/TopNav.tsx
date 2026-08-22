"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { TABS, useAppStore, type TabId } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";
import logoMark from "@/public/logo-mark.png";
import logoWordmark from "@/public/logo-wordmark.png";

/**
 * Desktop header.
 *
 * The legacy nav only rendered four links, so Release Tracker and Settings
 * were unreachable on desktop — there was no `#nav-tracker` or
 * `#nav-settings`. Here the links are generated from TABS, so every tab is
 * always reachable.
 */
export function TopNav() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const setAddSourceOpen = useAppStore((s) => s.setAddSourceOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const navRef = useRef<HTMLElement>(null);

  // Solid/blurred once the page has scrolled past the hero lip.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const onScroll = () => el.classList.toggle("scrolled", window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // "/" opens search, the way most media apps do it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  return (
    <header
      ref={navRef}
      className="dynamic-nav fixed top-0 z-50 w-full border-b border-transparent bg-transparent font-label-md text-label-md"
    >
      <div className="mx-auto flex w-full max-w-container-max items-center justify-between gap-6 px-margin-mobile py-4 md:px-margin-desktop">
        <button
          type="button"
          onClick={() => setTab("discover")}
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="CineSync home"
        >
          {/*
            The brand lockup ships as two transparent PNGs cut from the master
            render — the orb on its own so it can be sized independently of the
            wordmark, which is hidden on the narrowest screens.
          */}
          <Image
            src={logoMark}
            alt=""
            aria-hidden="true"
            sizes="40px"
            preload
            className="h-9 w-9 shrink-0 drop-shadow-[0_0_10px_rgba(79,172,254,0.45)] transition-transform duration-300 group-hover:scale-105"
          />
          <Image
            src={logoWordmark}
            alt="CineSync"
            sizes="120px"
            preload
            className="hidden h-5 w-auto sm:block"
          />
        </button>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {TABS.map((t) => (
            <NavLink key={t.id} id={t.id} label={t.label} active={tab === t.id} onSelect={setTab} />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search films, series and people"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-surface-container/60 py-2 pl-3 pr-2 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary lg:pr-3"
          >
            <Icon name="search" className="text-[20px]" />
            <span className="hidden font-label-md text-label-md lg:inline">Search</span>
            <kbd className="hidden rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-on-surface-variant/70 lg:inline">
              /
            </kbd>
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="hidden text-on-surface-variant transition-colors hover:text-primary sm:inline"
          >
            <Icon name="notifications" />
          </button>
          <button
            type="button"
            aria-label="Manage connected sources"
            onClick={() => setAddSourceOpen(true)}
            className="text-on-surface-variant transition-colors hover:text-primary"
          >
            <Icon name="account_circle" />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  id,
  label,
  active,
  onSelect,
}: {
  id: TabId;
  label: string;
  active: boolean;
  onSelect: (id: TabId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "relative font-bold text-primary transition-transform duration-300 after:absolute after:-bottom-3 after:left-1/2 after:h-1 after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-primary after:shadow-[0_0_15px_rgba(78,222,163,1)] after:content-['']"
          : "text-on-surface-variant transition-colors duration-300 hover:scale-105 hover:text-primary"
      }
    >
      {label}
    </button>
  );
}
