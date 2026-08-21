"use client";

import { motion } from "framer-motion";
import { TABS, useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";

/** Mobile tab bar. Same five destinations as the legacy bottom nav, plus Settings. */
export function BottomNav() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <nav
      className="fixed bottom-0 left-0 z-[100] flex w-full items-center justify-around rounded-t-lg border-t border-white/5 bg-surface-container/85 px-2 py-2.5 shadow-2xl backdrop-blur-lg md:hidden"
      aria-label="Primary mobile"
    >
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <motion.button
            key={t.id}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setTab(t.id)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center rounded-xl p-1.5 transition-colors ${
              active ? "bg-primary/10 text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name={t.icon} className="mb-0.5 text-[22px]" fill={active} />
            <span className="text-[10px] leading-none">{t.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
