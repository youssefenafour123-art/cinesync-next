import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Icon } from "@/components/ui/Icon";
import { ON_SURFACE_VARIANT } from "@/lib/theme";

/**
 * The header: wordmark on the left, search and account on the right.
 *
 * The web's `TopNav` also carries the full desktop navigation and a `/`
 * keyboard shortcut, neither of which has a counterpart here — the tab bar is
 * the navigation, and there is no keyboard to shortcut. What is left is the
 * identity and the two actions.
 *
 * It scrolls with the content rather than being fixed. The web version pins
 * itself and fades in a background past 50px; on a phone a pinned header costs
 * ~64pt of a short screen permanently, and the tab bar already gives a fixed
 * anchor at the other end.
 */
export function TopBar({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      className="flex-row items-center justify-between px-margin-mobile pb-3"
      style={{ paddingTop: insets.top + 8 }}
    >
      {title ? (
        <Text className="font-display-bold text-[28px] text-on-surface">{title}</Text>
      ) : (
        <Image
          source={require("../../assets/images/logo-wordmark.png")}
          style={{ width: 132, height: 30 }}
          contentFit="contain"
          accessibilityLabel="CineSync"
        />
      )}

      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={() => router.push("/search")}
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={8}
          className="rounded-full p-2.5 active:bg-white/10"
        >
          <Icon name="search" size={24} color={ON_SURFACE_VARIANT} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/library")}
          accessibilityRole="button"
          accessibilityLabel="Your library and connected accounts"
          hitSlop={8}
          className="rounded-full p-2.5 active:bg-white/10"
        >
          <Icon name="account_circle" size={24} color={ON_SURFACE_VARIANT} />
        </Pressable>
      </View>
    </View>
  );
}
