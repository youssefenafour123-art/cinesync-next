import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import type { MediaItem } from "@cinesync/shared/types";
import { PosterImage } from "./PosterImage";
import { Icon } from "./Icon";
import { useOpenTitle } from "@/lib/useOpenTitle";
import { useAppStore } from "@/store/useAppStore";
import { brand } from "@/lib/theme";

/** Rail cards are a fixed 190pt, matching the web; grid cards fill their cell. */
export const RAIL_CARD_WIDTH = 190;
export const RAIL_GAP = 18;

interface PosterCardProps {
  item: MediaItem;
  variant?: "rail" | "grid";
  showMeta?: boolean;
  /** Position in its rail, used to stagger the entrance. */
  index?: number;
}

/**
 * A single title.
 *
 * Two things from the web version deliberately did not come across.
 *
 * The animated conic-gradient edge light (`.poster-glow`) has no React Native
 * equivalent — there is no conic gradient and no mask compositing without
 * pulling in Skia, which is not available inside Expo Go. A faithful version
 * would also mean twenty independently animating shader rings on one rail,
 * which is real battery cost for decoration. What is here instead is the
 * static read of the same light: a hairline primary-tinted border and a
 * highlight along the top edge.
 *
 * And `whileHover={{ y: -8 }}` is gone, because a finger has no hover. The
 * press state does the work instead, which is the gesture that actually exists.
 */
export function PosterCard({ item, variant = "rail", showMeta = true, index = 0 }: PosterCardProps) {
  const openTitle = useOpenTitle();
  const inLibrary = useAppStore((s) => (item.imdbId ? s.libraryIds.has(item.imdbId) : false));

  const subtitle = [item.year ?? "TBA", item.kind === "series" ? "TV" : "Movie"]
    .filter(Boolean)
    .join(" • ");

  return (
    <MotiView
      from={{ opacity: 0, translateY: 24 }}
      animate={{ opacity: 1, translateY: 0 }}
      // The web staggers a rail by 0.05s per card through Framer's
      // `staggerChildren`. Capped here so a long rail's last card doesn't
      // arrive a second and a half after its first.
      transition={{ type: "timing", duration: 320, delay: Math.min(index, 8) * 50 }}
      style={variant === "rail" ? { width: RAIL_CARD_WIDTH } : undefined}
    >
      <Pressable
        onPress={() => openTitle(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open details for ${item.title}`}
        className="active:opacity-90"
      >
        {({ pressed }) => (
          <MotiView animate={{ scale: pressed ? 0.97 : 1 }} transition={{ type: "timing", duration: 120 }}>
            <View className="relative aspect-[2/3] overflow-hidden rounded-poster border border-primary/20 bg-surface-container">
              <PosterImage src={item.poster} alt={item.title} className="h-full w-full" />

              {/* The static stand-in for the web's spinning edge light. */}
              <LinearGradient
                colors={["rgba(110,255,200,0.28)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                pointerEvents="none"
                style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }}
              />

              {item.rating ? (
                <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-full border border-white/10 bg-black/75 px-2 py-1">
                  <Icon name="star" size={14} color={brand.imdb} />
                  <Text className="font-body-semibold text-[12px] text-white">{item.rating}</Text>
                </View>
              ) : null}

              {inLibrary ? (
                <View className="absolute right-2 top-2 flex-row items-center gap-1 rounded-full border border-white/20 bg-primary/90 px-2 py-1">
                  <Icon name="check" size={13} color="#002113" />
                  <Text className="font-body-semibold text-[11px] text-on-primary-fixed">
                    In Library
                  </Text>
                </View>
              ) : null}
            </View>

            {showMeta ? (
              <View className="px-1 pt-2.5">
                <Text numberOfLines={1} className="font-body-semibold text-[15px] text-on-surface">
                  {item.title}
                </Text>
                <Text className="mt-0.5 font-body text-[12px] text-on-surface-variant">
                  {subtitle}
                </Text>
              </View>
            ) : null}
          </MotiView>
        )}
      </Pressable>
    </MotiView>
  );
}
