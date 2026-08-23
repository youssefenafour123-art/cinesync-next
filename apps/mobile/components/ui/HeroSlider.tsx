import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View, useWindowDimensions } from "react-native";
import { AnimatePresence, MotiView } from "moti";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import type { MediaItem } from "@cinesync/shared/types";
import { Icon } from "./Icon";
import { useOpenTitle } from "@/lib/useOpenTitle";
import { PRIMARY } from "@/lib/theme";

/** How long each slide holds. Same value as the web's `ADVANCE_MS`. */
const ADVANCE_MS = 8000;
/** Framer's `staggerChildren: 0.07` / `delayChildren: 0.12`, in ms. */
const COPY_STAGGER = 70;
const COPY_DELAY = 120;

/**
 * The Discover hero.
 *
 * The one component ported faithfully rather than simplified, because it is the
 * first thing anyone sees and its motion *is* the design. Everything the web
 * version does is here: the directional cross-slide, the continuous Ken Burns
 * pan over the backdrop, the copy arriving one line at a time, and dots whose
 * active pip fills over exactly the time the slide has left.
 *
 * Two differences, both because the input is different. The web pauses on
 * focus; there is no focus here, so it pauses when the app is backgrounded —
 * which is the case that actually matters, since a timer left running behind a
 * locked screen would burn through several slides and land somewhere arbitrary.
 * And the web's hover states are gone in favour of press states.
 */
export function HeroSlider({ items }: { items: MediaItem[] }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [running, setRunning] = useState(true);
  const openTitle = useOpenTitle();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const height = Math.max(460, width * 1.15);
  const item = items[index];

  const go = useCallback(
    (next: number, dir: number) => {
      setDirection(dir);
      setIndex(((next % items.length) + items.length) % items.length);
    },
    [items.length],
  );

  // Advance on a timeout rather than an interval, so tapping a dot restarts the
  // full 8s rather than inheriting whatever was left of the previous slide.
  useEffect(() => {
    if (!running || items.length < 2) return;
    timer.current = setTimeout(() => go(index + 1, 1), ADVANCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, running, items.length, go]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setRunning(s === "active"));
    return () => sub.remove();
  }, []);

  if (!items.length) {
    return <View style={{ height }} className="bg-surface-container-lowest" />;
  }

  return (
    <View style={{ height }} className="relative overflow-hidden">
      <AnimatePresence>
        <MotiView
          key={item.key}
          from={{ opacity: 0, translateX: direction * 80, scale: 1.12 }}
          animate={{ opacity: 1, translateX: 0, scale: 1.06 }}
          exit={{ opacity: 0, translateX: -direction * 80 }}
          // 1.05s and the same ease-out-quint the web uses. Slower than a
          // normal transition on purpose — it reads as a camera move.
          transition={{ type: "timing", duration: 1050, easing: Easing.bezier(0.22, 1, 0.36, 1) }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <KenBurns uri={item.backdrop ?? item.poster} running={running} slideKey={item.key} />
        </MotiView>
      </AnimatePresence>

      {/* Two stacked washes: a bottom-weighted one for the copy to sit on, and
          a left-weighted one so the title stays readable over a bright frame. */}
      <LinearGradient
        colors={["transparent", "rgba(5,5,5,0.35)", "rgba(5,5,5,0.96)"]}
        locations={[0, 0.45, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        pointerEvents="none"
      />

      <View className="absolute bottom-0 left-0 right-0 gap-3 px-margin-mobile pb-14">
        <CopyLine index={0} slideKey={item.key}>
          <View className="flex-row items-center gap-2">
            {item.rating ? (
              <View className="flex-row items-center gap-1 rounded-full bg-black/60 px-2.5 py-1">
                <Icon name="star" size={13} color="#f5c518" />
                <Text className="font-body-semibold text-[12px] text-white">{item.rating}</Text>
              </View>
            ) : null}
            <Text className="font-body text-label-md uppercase text-on-surface-variant">
              {[item.year, item.kind === "series" ? "Series" : "Film"].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </CopyLine>

        <CopyLine index={1} slideKey={item.key}>
          <Text numberOfLines={2} className="font-display-bold text-[34px] leading-[40px] text-on-surface">
            {item.title}
          </Text>
        </CopyLine>

        {item.description ? (
          <CopyLine index={2} slideKey={item.key}>
            <Text numberOfLines={3} className="font-body text-body-md text-on-surface-variant">
              {item.description}
            </Text>
          </CopyLine>
        ) : null}

        <CopyLine index={3} slideKey={item.key}>
          <Pressable
            onPress={() => openTitle(item)}
            accessibilityRole="button"
            className="mt-1 flex-row items-center gap-2 self-start rounded-full bg-primary px-6 py-3 active:opacity-85"
          >
            <Icon name="play_arrow" size={20} color="#002113" />
            <Text className="font-body-semibold text-body-md text-on-primary-fixed">Details</Text>
          </Pressable>
        </CopyLine>
      </View>

      <View className="absolute bottom-5 left-0 right-0 flex-row justify-center gap-2">
        {items.map((s, i) => (
          <Pressable
            key={s.key}
            onPress={() => go(i, i > index ? 1 : -1)}
            accessibilityRole="button"
            accessibilityLabel={`Show slide ${i + 1} of ${items.length}`}
            hitSlop={8}
          >
            <View
              className={`h-[6px] overflow-hidden rounded-full ${
                i === index ? "w-9 bg-white/25" : "w-[6px] bg-white/30"
              }`}
            >
              {i === index ? <DotProgress running={running} slideKey={item.key} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * The slow zoom across a still backdrop.
 *
 * Keyed on the slide so each one starts its pan from the beginning; `withRepeat`
 * reversing means a slide left up longer keeps moving instead of parking.
 */
function KenBurns({ uri, running, slideKey }: { uri?: string; running: boolean; slideKey: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = 1;
    if (!running) return;
    scale.value = withRepeat(
      withTiming(1.1, { duration: ADVANCE_MS + 2000, easing: Easing.linear }),
      -1,
      true,
    );
    return () => cancelAnimation(scale);
  }, [slideKey, running, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ flex: 1 }, style]}>
      <Image
        source={{ uri }}
        style={{ flex: 1 }}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
      />
    </Animated.View>
  );
}

/** One line of hero copy, arriving after the ones above it. */
function CopyLine({
  index,
  slideKey,
  children,
}: {
  index: number;
  slideKey: string;
  children: React.ReactNode;
}) {
  return (
    <MotiView
      key={`${slideKey}-${index}`}
      from={{ opacity: 0, translateY: 18 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 420, delay: COPY_DELAY + index * COPY_STAGGER }}
    >
      {children}
    </MotiView>
  );
}

/**
 * The active dot's fill.
 *
 * Better than a plain highlight: it shows how long is left on the slide, so the
 * hero advancing never feels like it happened to you.
 */
function DotProgress({ running, slideKey }: { running: boolean; slideKey: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    if (!running) return;
    progress.value = withTiming(1, { duration: ADVANCE_MS, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [slideKey, running, progress]);

  const style = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Animated.View style={[{ height: "100%", backgroundColor: PRIMARY }, style]} />
  );
}
