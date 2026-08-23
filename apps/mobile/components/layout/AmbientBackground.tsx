import { useEffect, useMemo, useState } from "react";
import { AppState, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { brand, WALL_SCRIM } from "@/lib/theme";
import { useAppStore } from "@/store/useAppStore";

/**
 * The drifting poster wall behind the Discover screen.
 *
 * This is a new component that shares the web version's idea, not a port of it.
 * About two thirds of `apps/web/components/layout/AmbientBackground.tsx` exists
 * to answer a cursor: per-column pointer proximity lighting, a screen-blended
 * spotlight that follows the mouse, and a GSAP ticker driving `rotateY`/`rotateX`
 * from pointer velocity. None of that has an input on a phone, so porting it
 * would be porting dead code.
 *
 * What is left is what someone actually sees: columns of posters drifting at
 * different speeds behind a scrim, lit by three slow aurora orbs. Five columns
 * instead of twelve and twenty images instead of ninety-six, because this is
 * decoration and it is competing for the GPU with a rail the user is scrolling.
 *
 * The orbs are SVG radial gradients rather than `expo-blur`. BlurView blurs
 * what is behind it, so it cannot produce a soft-edged coloured orb at all, and
 * it is expensive on Android; a radial gradient is exactly the shape wanted and
 * costs nothing.
 */

const COLUMNS = 5;
const PER_COLUMN = 4;
const COLUMN_WIDTH = 108;
const GAP = 16;
/** Per-column drift, in ms for one full pass. Different so they never lock up. */
const DURATIONS = [58000, 72000, 64000, 81000, 69000];

function Column({
  posters,
  index,
  height,
  active,
}: {
  posters: string[];
  index: number;
  height: number;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      return;
    }
    // The track holds the posters twice over, so translating by exactly half
    // its height lands on an identical frame and the loop is seamless.
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: DURATIONS[index % DURATIONS.length], easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [active, index, progress]);

  // Alternate direction so the wall reads as depth rather than as one sheet
  // sliding past.
  const up = index % 2 === 0;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (up ? -1 : 1) * progress.value * height }],
  }));

  const doubled = [...posters, ...posters];

  return (
    <Animated.View style={[{ width: COLUMN_WIDTH, gap: GAP }, style]}>
      {doubled.map((uri, i) => (
        <Image
          key={`${uri}-${i}`}
          source={{ uri }}
          style={{
            width: COLUMN_WIDTH,
            aspectRatio: 2 / 3,
            borderRadius: 12,
            backgroundColor: "#101010",
          }}
          contentFit="cover"
          // Decorative and off-screen half the time — no cross-fade needed, and
          // a low priority keeps it out of the way of the posters being read.
          transition={0}
          priority="low"
          cachePolicy="memory-disk"
        />
      ))}
    </Animated.View>
  );
}

function Aurora({ width, height }: { width: number; height: number }) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 25000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [drift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 40 - 20 }, { translateY: drift.value * -30 + 15 }],
  }));

  const r = Math.max(width, height) * 0.55;

  return (
    <Animated.View style={[{ position: "absolute", inset: 0, opacity: 0.3 }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          {brand.aurora.map((color, i) => (
            <RadialGradient key={color} id={`orb${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.6} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Circle cx={width * 0.2} cy={height * 0.18} r={r * 0.6} fill="url(#orb0)" />
        <Circle cx={width * 0.85} cy={height * 0.42} r={r * 0.55} fill="url(#orb1)" />
        <Circle cx={width * 0.45} cy={height * 0.82} r={r * 0.45} fill="url(#orb2)" />
      </Svg>
    </Animated.View>
  );
}

export function AmbientBackground() {
  const wall = useAppStore((s) => s.wall);
  const { width, height } = useWindowDimensions();

  // Stop the drift while the app is backgrounded. Reanimated keeps a repeating
  // animation running otherwise, which is battery spent on pixels nobody is
  // looking at.
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setActive(next === "active"));
    return () => sub.remove();
  }, []);

  const columns = useMemo(() => {
    if (wall.length < COLUMNS * PER_COLUMN) return [];
    return Array.from({ length: COLUMNS }, (_, c) =>
      wall.slice(c * PER_COLUMN, c * PER_COLUMN + PER_COLUMN),
    );
  }, [wall]);

  if (!columns.length) {
    return <View className="absolute inset-0 bg-background" pointerEvents="none" />;
  }

  const columnHeight = PER_COLUMN * (COLUMN_WIDTH * 1.5 + GAP);

  return (
    <View className="absolute inset-0 overflow-hidden bg-background" pointerEvents="none">
      <View
        className="absolute flex-row"
        style={{
          // Overscanned on every side so a column's wrap point is never on
          // screen, and rotated slightly so the wall reads as a backdrop
          // rather than as a grid.
          top: -columnHeight * 0.25,
          left: -COLUMN_WIDTH * 0.5,
          gap: GAP,
          opacity: 0.35,
          transform: [{ rotate: "-8deg" }],
        }}
      >
        {columns.map((posters, i) => (
          <Column key={i} posters={posters} index={i} height={columnHeight} active={active} />
        ))}
      </View>

      <Aurora width={width} height={height} />

      <LinearGradient
        colors={[...WALL_SCRIM.colors]}
        locations={[...WALL_SCRIM.locations]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}
