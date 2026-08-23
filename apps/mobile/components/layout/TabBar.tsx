import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
// From expo-router's vendored copy, not the standalone `@react-navigation/bottom-tabs`
// package. Expo Router SDK 57 ships its own fork of the navigator, and the two
// sets of types are structurally incompatible — installing the standalone one
// makes this file stop compiling against the `<Tabs>` it is actually passed to.
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs/types";
import { MotiView } from "moti";
import { TABS } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";
import { ON_SURFACE_VARIANT, PRIMARY } from "@/lib/theme";

/**
 * The eight-destination tab bar.
 *
 * A custom bar rather than the navigator's own, for the same reason the web
 * app hand-rolls its `BottomNav`: eight cells is well past what a stock tab bar
 * lays out sensibly, and the stock one has no way to swap in a shorter label
 * for one destination. The web solves that with the `short` field — "My
 * Library" renders as "Library" — and this reads the same field from the same
 * `TABS` array.
 *
 * Below ~360pt even the short labels stop fitting across eight cells, so the
 * bar drops to icons only rather than letting a label wrap and knock one icon
 * out of line with the other seven.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const showLabels = width >= 360;

  return (
    <View
      className="flex-row items-center justify-around border-t border-white/5 bg-surface-container/95 px-2 pt-2"
      style={{ paddingBottom: insets.bottom || 10 }}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.route === route.name);
        if (!tab) return null;

        const focused = state.index === index;
        const label = "short" in tab ? tab.short : tab.label;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (focused || event.defaultPrevented) return;
              void Haptics.selectionAsync();
              navigation.navigate(route.name);
            }}
            className="flex-1 items-center justify-center"
          >
            <MotiView
              animate={{ scale: focused ? 1 : 0.94 }}
              transition={{ type: "timing", duration: 160 }}
              className={`items-center justify-center rounded-xl px-1.5 py-1.5 ${
                focused ? "bg-primary/10" : ""
              }`}
            >
              <Icon
                name={tab.icon}
                size={22}
                color={focused ? PRIMARY : ON_SURFACE_VARIANT}
                fill={focused}
              />
              {showLabels ? (
                <Text
                  numberOfLines={1}
                  className={`mt-0.5 font-body text-[10px] leading-none ${
                    focused ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {label}
                </Text>
              ) : null}
            </MotiView>
          </Pressable>
        );
      })}
    </View>
  );
}
