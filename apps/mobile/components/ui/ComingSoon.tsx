import { ScrollView, Text, View } from "react-native";
import { TopBar } from "@/components/layout/TopBar";
import { Icon } from "./Icon";
import { ON_SURFACE_VARIANT } from "@/lib/theme";

/**
 * Placeholder for a tab that has not been built yet.
 *
 * The eight destinations exist in the tab bar from the start, on purpose. A bar
 * that grows a cell every time a screen lands would move every other icon under
 * the user's thumb; showing all eight and saying plainly which are not ready
 * costs one screen and keeps the layout fixed.
 */
export function ComingSoon({ title, icon, blurb }: { title: string; icon: string; blurb: string }) {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <TopBar title={title} />
      <View className="flex-1 items-center justify-center gap-4 px-margin-mobile pb-24">
        <Icon name={icon} size={44} color={ON_SURFACE_VARIANT} />
        <Text className="text-center font-body text-body-md text-on-surface-variant">{blurb}</Text>
        <Text className="text-center font-body text-label-md uppercase text-on-surface-variant/60">
          Available on the web app today
        </Text>
      </View>
    </ScrollView>
  );
}
