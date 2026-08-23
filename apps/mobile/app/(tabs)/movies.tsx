import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MotiView } from "moti";
import type { MoodPayload, MoviesPayload } from "@cinesync/shared/payloads";
import { endpoints } from "@cinesync/shared/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { TopBar } from "@/components/layout/TopBar";
import { Rail } from "@/components/ui/Rail";
import { Chip } from "@/components/ui/Chip";
import { PosterCard } from "@/components/ui/PosterCard";
import { ErrorState, LoadingState, PosterSkeleton } from "@/components/ui/States";

/**
 * Curated Picks — a mood browser plus three ranked rails.
 *
 * The web lays the curated rails out as 2/3/4-column grids of `TiltCard`s with
 * a sticky curator's note beside them. Neither survives the width: a tilt card
 * is a mouse-parallax effect, and a sidebar has nowhere to go on a phone. The
 * rails become the same horizontal rails used everywhere else, and the mood
 * results become a two-column grid, which is as wide as a poster can be and
 * still be legible.
 */
export default function MoviesScreen() {
  const { data, loading, error, reload } = useFetch<MoviesPayload>(endpoints.movies());
  const [mood, setMood] = useState("psychological");
  const moodState = useFetch<MoodPayload>(endpoints.mood(mood));
  const registerItems = useAppStore((s) => s.registerItems);

  useEffect(() => {
    const items = [
      ...(data?.rails.flatMap((r) => r.items) ?? []),
      ...(moodState.data?.rail?.items ?? []),
    ];
    if (items.length) registerItems(items);
  }, [data, moodState.data, registerItems]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <TopBar title="Curated Picks" />

      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 280 }}
      >
        <Text className="px-margin-mobile font-body text-body-md text-on-surface-variant">
          Ranked by weighted rating, so a film with nine perfect votes can’t outrank a masterpiece
          with four thousand.
        </Text>

        <View className="mt-10">
          <Text className="mb-4 px-margin-mobile font-display text-[24px] text-on-surface">
            Browse by Mood
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
            className="mb-6"
          >
            {(moodState.data?.moods ?? []).map((m) => (
              <Chip key={m.id} label={m.label} selected={mood === m.id} onPress={() => setMood(m.id)} />
            ))}
          </ScrollView>

          {moodState.error && !moodState.data ? (
            <ErrorState message={moodState.error} onRetry={moodState.reload} />
          ) : moodState.loading && !moodState.data ? (
            <LoadingState label="Finding the good ones" />
          ) : moodState.data?.rail ? (
            <View
              // Keyed on the mood so switching cross-fades the grid rather than
              // swapping posters in place, which reads as the images failing.
              key={mood}
              className="flex-row flex-wrap justify-between gap-y-6 px-margin-mobile"
            >
              {moodState.data.rail.items.map((item, i) => (
                <View key={item.key} className="w-[48%]">
                  <PosterCard item={item} variant="grid" index={i} />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View className="mt-14">
          {error && !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            <Rail title="Cult Classics" items={[]}>
              <PosterSkeleton />
            </Rail>
          ) : (
            data?.rails.map((rail) => <Rail key={rail.title} title={rail.title} items={rail.items} />)
          )}
        </View>
      </MotiView>
    </ScrollView>
  );
}
