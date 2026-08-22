"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { MediaItem } from "@/lib/types";
import { PosterImage } from "./PosterImage";
import { Icon } from "./Icon";

interface PosterCardProps {
  item: MediaItem;
  /** Rail cards are fixed width; grid cards fill their cell. */
  variant?: "rail" | "grid";
  showMeta?: boolean;
}

/**
 * A single title.
 *
 * Every card carries its own `item` and opens the details modal with it —
 * which is the fix for the legacy bug where `openDetails()` wrote into
 * element IDs that didn't exist, so every card showed the same hardcoded
 * Oppenheimer panel.
 */
/**
 * Phase offset for the animated edge light, derived from the item's own key.
 *
 * A rail of posters all starting their sweep on the same frame pulses in
 * unison, which reads as a loading indicator rather than as ambient light.
 * Deriving the offset from the key rather than from `Math.random()` keeps it
 * stable across renders and identical on the server and the client — a random
 * value here would be a hydration mismatch.
 */
function edgeDelay(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return `-${(Math.abs(hash) % 700) / 100}s`;
}

export function PosterCard({ item, variant = "rail", showMeta = true }: PosterCardProps) {
  const openDetails = useAppStore((s) => s.openDetails);
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));

  const subtitle = [item.year ?? "TBA", item.kind === "series" ? "TV" : "Movie"]
    .filter(Boolean)
    .join(" • ");

  return (
    <motion.div
      layout="position"
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0 },
      }}
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={variant === "rail" ? "w-[190px] shrink-0 cursor-pointer" : "cursor-pointer"}
      onClick={() => openDetails(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails(item);
        }
      }}
      aria-label={`Open details for ${item.title}`}
    >
      <div
        className="poster-glow group relative aspect-[2/3] overflow-hidden rounded-[14px] border border-white/5 bg-surface-container shadow-[0_12px_30px_rgba(0,0,0,0.55)] transition-all duration-300"
        style={{ "--cs-edge-delay": edgeDelay(item.key) } as React.CSSProperties}
      >
        <PosterImage
          src={item.poster}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {item.rating ? (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/75 px-2 py-1 text-[12px] font-bold text-white backdrop-blur-sm">
            <Icon name="star" className="text-[14px] text-[#f5c518]" fill />
            {item.rating}
          </div>
        ) : null}

        {inLibrary ? (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-white/20 bg-primary/90 px-2 py-1 text-[11px] font-bold text-[#002113] backdrop-blur-sm">
            <Icon name="check" className="text-[14px]" />
            In Library
          </div>
        ) : null}
      </div>

      {showMeta ? (
        <div className="px-1 pt-2.5">
          <h3 className="truncate font-title-lg text-[15px] font-semibold text-on-surface">
            {item.title}
          </h3>
          <p className="mt-0.5 text-[12px] text-on-surface-variant">{subtitle}</p>
        </div>
      ) : null}
    </motion.div>
  );
}
