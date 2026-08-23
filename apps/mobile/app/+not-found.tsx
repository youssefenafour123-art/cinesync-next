import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { ON_SURFACE_VARIANT } from "@/lib/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="flex-1 items-center justify-center gap-4 bg-background px-margin-mobile">
        <Icon name="search_off" size={44} color={ON_SURFACE_VARIANT} />
        <Text className="text-center font-body text-body-md text-on-surface-variant">
          That screen doesn’t exist.
        </Text>
        <Link href="/" className="font-body-semibold text-body-md text-primary">
          Back to Discover
        </Link>
      </View>
    </>
  );
}
