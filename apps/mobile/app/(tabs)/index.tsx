import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { MotiView } from "moti";
import type { DiscoverPayload } from "@cinesync/shared/payloads";
import { endpoints } from "@cinesync/shared/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { AmbientBackground } from "@/components/layout/AmbientBackground";
import { TopBar } from "@/components/layout/TopBar";
import { HeroSlider } from "@/components/ui/HeroSlider";
import { Rail } from "@/components/ui/Rail";
import { ErrorState, PosterSkeleton } from "@/components/ui/States";

/**
 * Discover — the hero plus two "most watched" rails.
 *
 * The ambient poster wall is mounted here rather than app-wide, which is the
 * one structural difference from the web. There it lives in the root layout and
 * sits behind every tab; a full-screen grid of drifting images behind the
 * Settings form is pure battery cost on a phone, and it is only ever visible
 * through this screen's gaps anyway.
 */
export default function DiscoverScreen() {
  const { data, loading, error, reload } = useFetch<DiscoverPayload>(endpoints.discover());
  const setWall = useAppStore((s) => s.setWall);
  const registerItems = useAppStore((s) => s.registerItems);

  useEffect(() => {
    if (data?.wall?.length) setWall(data.wall);
  }, [data, setWall]);

  // Register everything on screen so the details route can render instantly
  // from the store instead of re-fetching what this payload already carried.
  useEffect(() => {
    if (!data) return;
    registerItems([...data.hero, ...data.rails.flatMap((r) => r.items)]);
  }, [data, registerItems]);

  if (error && !data) {
    return (
      <View className="flex-1">
        <TopBar />
        <ErrorState message={error} onRetry={reload} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <AmbientBackground />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        stickyHeaderIndices={[]}
      >
        <TopBar />

        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 280 }}
        >
          <HeroSlider items={data?.hero ?? []} />

          <View className="mt-10">
            {loading && !data ? (
              <Rail title="Most Watched Movies" items={[]}>
                <PosterSkeleton />
              </Rail>
            ) : (
              data?.rails.map((rail) => (
                <Rail key={rail.title} title={rail.title} items={rail.items} />
              ))
            )}
          </View>
        </MotiView>
      </ScrollView>
    </View>
  );
}
