import { Tabs } from "expo-router";
import { TabBar } from "@/components/layout/TabBar";
import { BACKGROUND } from "@/lib/theme";

/**
 * The eight destinations that were a zustand string on the web.
 *
 * Order here has to match `TABS` in `store/useAppStore.ts` — `TabBar` looks
 * each route up by name to find its icon and label, and a route with no entry
 * there renders nothing.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: BACKGROUND },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Discover" }} />
      <Tabs.Screen name="movies" options={{ title: "Movies" }} />
      <Tabs.Screen name="anime" options={{ title: "Anime" }} />
      <Tabs.Screen name="arabic" options={{ title: "Arabic" }} />
      <Tabs.Screen name="tracker" options={{ title: "Upcoming" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="library" options={{ title: "My Library" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
