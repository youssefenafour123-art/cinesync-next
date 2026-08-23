import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "./Icon";
import { ON_SURFACE_VARIANT, PRIMARY } from "@/lib/theme";

/**
 * Loading, error and empty states — a port of `apps/web/components/ui/States.tsx`,
 * plus one addition the web app doesn't need.
 *
 * That addition is `slow`. The route handlers live on Render's free plan, which
 * spins the service down after fifteen minutes idle and takes the better part
 * of a minute to wake. On the web that reads as a slow page; on a phone, where
 * a session is often twenty seconds long, a skeleton that sits there for fifty
 * seconds reads as a broken app. So after four seconds the copy says what is
 * actually happening.
 */

const SLOW_AFTER_MS = 4000;

export function LoadingState({ label = "Loading", slow = false }: { label?: string; slow?: boolean }) {
  return (
    <View className="items-center justify-center gap-3 py-16">
      <ActivityIndicator size="large" color={PRIMARY} />
      <Text className="font-body text-body-md text-on-surface-variant">
        {slow ? "Waking the server up — this takes a moment on the free tier" : `${label}…`}
      </Text>
    </View>
  );
}

export { SLOW_AFTER_MS };

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="items-center justify-center gap-4 px-margin-mobile py-16">
      <Icon name="cloud_off" size={40} color={ON_SURFACE_VARIANT} />
      <Text className="text-center font-body text-body-md text-on-surface-variant">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="rounded-full bg-primary px-5 py-2.5 active:opacity-80"
        >
          <Text className="font-body-semibold text-label-md text-on-primary-fixed">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  message,
  icon = "search_off",
}: {
  message: string;
  icon?: string;
}) {
  return (
    <View className="items-center justify-center gap-3 px-margin-mobile py-16">
      <Icon name={icon} size={40} color={ON_SURFACE_VARIANT} />
      <Text className="text-center font-body text-body-md text-on-surface-variant">{message}</Text>
    </View>
  );
}

/**
 * Placeholder rail. Six 190pt cards, matching the real rail's geometry so the
 * layout doesn't shift when the data lands.
 */
export function PosterSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEnabled={false}
      contentContainerClassName="gap-[18px] px-margin-mobile"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="w-[190px]">
          <View className="aspect-[2/3] rounded-poster bg-surface-container" />
          <View className="mt-2.5 h-4 w-3/4 rounded bg-surface-container" />
          <View className="mt-1.5 h-3 w-1/2 rounded bg-surface-container-low" />
        </View>
      ))}
    </ScrollView>
  );
}
