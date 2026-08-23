import { useState } from "react";
import { FlatList, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { MediaItem } from "@cinesync/shared/types";
import { PosterCard, RAIL_CARD_WIDTH, RAIL_GAP } from "./PosterCard";
import { BACKGROUND } from "@/lib/theme";

const SNAP = RAIL_CARD_WIDTH + RAIL_GAP;
const FADE_WIDTH = 32;

interface RailProps {
  title: string;
  items: MediaItem[];
  /** Rendered instead of the list — used for the loading skeleton. */
  children?: React.ReactNode;
}

/**
 * A titled horizontal rail. Replaces the web's `Carousel`.
 *
 * This is a replacement rather than a port. The web version exists mostly to
 * make a mouse work on a horizontal strip: it tweens `scrollLeft` with GSAP,
 * shows arrow buttons on hover, and disables the arrow that has nothing left
 * to scroll to. None of that has any meaning under a thumb — arrows on a touch
 * rail are dead pixels, and the native momentum scroll is better than any
 * tween. `FlatList` also windows its content, which the web's plain overflow
 * container did not need to and a phone very much does.
 *
 * What is kept is the part that was visual rather than mechanical: the 32px
 * fades at each end, which the web draws with `mask-image` and toggles through
 * `.at-start` / `.at-end`. Same logic, same 190/18 geometry.
 */
export function Rail({ title, items, children }: RailProps) {
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setAtStart(contentOffset.x <= 4);
    setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 4);
  }

  return (
    <View className="mb-12">
      <Text className="mb-4 px-margin-mobile font-display text-[24px] text-on-surface">{title}</Text>

      <View className="relative">
        {children ?? (
          <FlatList
            horizontal
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={({ item, index }) => <PosterCard item={item} index={index} />}
            showsHorizontalScrollIndicator={false}
            // `snapToInterval` rather than `pagingEnabled`: a rail should come
            // to rest on a card boundary, not scroll one screen at a time.
            snapToInterval={SNAP}
            decelerationRate="fast"
            snapToAlignment="start"
            onScroll={onScroll}
            scrollEventThrottle={32}
            contentContainerStyle={{ gap: RAIL_GAP, paddingHorizontal: 20 }}
            initialNumToRender={3}
            windowSize={5}
            removeClippedSubviews
            getItemLayout={(_, index) => ({ length: SNAP, offset: SNAP * index, index })}
          />
        )}

        {!atStart ? (
          <LinearGradient
            colors={[BACKGROUND, "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: FADE_WIDTH }}
          />
        ) : null}

        {!atEnd ? (
          <LinearGradient
            colors={["transparent", BACKGROUND]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: FADE_WIDTH }}
          />
        ) : null}
      </View>
    </View>
  );
}
