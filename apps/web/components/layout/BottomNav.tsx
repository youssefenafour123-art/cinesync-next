"use client";

import { motion } from "framer-motion";
import { TABS, useAppStore } from "@/store/useAppStore";
import { useTabHoverPrefetch } from "@/lib/useTabPrefetch";
import { Icon } from "@/components/ui/Icon";

/** Mobile tab bar. Same five destinations as the legacy bottom nav, plus Settings. */
export function BottomNav() {
  const tab = useAppStore((s) => s.tab);
  const profileOpen = useAppStore((s) => s.profileOpen);
  const setTab = useAppStore((s) => s.setTab);
  const warm = useTabHoverPrefetch();

  return (
    <nav
      className="fixed bottom-0 left-0 z-[100] flex w-full items-center justify-around rounded-t-lg border-t border-white/5 bg-surface-container/85 px-2 py-2.5 shadow-2xl backdrop-blur-lg md:hidden"
      aria-label="Primary mobile"
    >
      {TABS.map((t) => {
        const active = !profileOpen && tab === t.id;
        return (
          <motion.button
            key={t.id}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setTab(t.id)}
            // Touch has no hover, but a finger lands on the target before it
            // lifts — enough of a head start to be worth taking.
            onPointerDown={() => warm(t.id)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center rounded-xl p-1.5 transition-colors ${
              active ? "bg-primary/10 text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name={t.icon} className="mb-0.5 text-[22px]" fill={active} />
            {/* `whitespace-nowrap` as well as the short label: a future tab
                should shrink its own text rather than silently wrap and knock
                every other icon in the row out of line. */}
            <span className="whitespace-nowrap text-[10px] leading-none">
              {"short" in t ? t.short : t.label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}
