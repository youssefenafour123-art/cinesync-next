import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MotiView } from "moti";
import type { Person, PersonCredit } from "@cinesync/shared/types";
import { endpoints } from "@cinesync/shared/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ON_SURFACE_VARIANT } from "@/lib/theme";

const BIO_CLAMP_AT = 420;

type TabId = "knownFor" | "upcoming" | "filmography";

const TABS: { id: TabId; label: string }[] = [
  { id: "knownFor", label: "Known For" },
  { id: "upcoming", label: "Upcoming" },
  { id: "filmography", label: "Filmography" },
];

/**
 * One person: photo, facts, biography and their credits.
 *
 * Pushed onto the stack rather than replacing whatever is under it, so opening
 * a cast member from a film and then a film from their filmography builds a
 * trail you can walk back down. That is the same behaviour the web gets from
 * `useModalBehavior`'s z-index counter, except here the navigator provides it.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const registerItem = useAppStore((s) => s.registerItem);
  const { data, loading, error, reload } = useFetch<Person>(endpoints.person(Number(id)));
  const [tab, setTab] = useState<TabId>("knownFor");
  const [bioOpen, setBioOpen] = useState(false);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label={loading ? "Loading profile" : "Loading"} />;

  const facts = [
    data.birthday ? { label: "Born", value: data.birthday } : null,
    data.placeOfBirth ? { label: "From", value: data.placeOfBirth } : null,
    { label: "Credits", value: String(data.filmography.length) },
  ].filter(Boolean) as { label: string; value: string }[];

  const credits = data[tab];
  const longBio = (data.biography?.length ?? 0) > BIO_CLAMP_AT;

  return (
    <ScrollView
      className="flex-1 bg-surface"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 48 }}
    >
      <View className="flex-row justify-end px-4 pt-14">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          className="rounded-full bg-surface-container p-2.5 active:opacity-75"
        >
          <Icon name="close" size={22} color={ON_SURFACE_VARIANT} />
        </Pressable>
      </View>

      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 260 }}
        className="px-margin-mobile"
      >
        <View className="flex-row gap-4">
          <PosterImage
            src={data.profile}
            alt={data.name}
            className="h-[132px] w-[92px] overflow-hidden rounded-2xl"
          />
          <View className="flex-1 justify-center">
            <Text className="font-display-bold text-[26px] leading-8 text-on-surface">
              {data.name}
            </Text>
            {data.department ? (
              <Text className="mt-1 font-body text-label-md uppercase text-primary">
                {data.department}
              </Text>
            ) : null}
            {data.imdbId ? (
              <Pressable
                onPress={() => void Linking.openURL(`https://www.imdb.com/name/${data.imdbId}/`)}
                accessibilityRole="link"
                className="mt-2 flex-row items-center gap-1.5 self-start active:opacity-70"
              >
                <Text className="font-body-medium text-label-md text-on-surface-variant">IMDb</Text>
                <Icon name="open_in_new" size={14} color={ON_SURFACE_VARIANT} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="mt-5 flex-row flex-wrap gap-x-8 gap-y-3 border-y border-white/10 py-4">
          {facts.map((f) => (
            <View key={f.label}>
              <Text className="mb-0.5 font-body-medium text-label-md uppercase text-primary">
                {f.label}
              </Text>
              <Text className="font-body text-body-md text-on-surface">{f.value}</Text>
            </View>
          ))}
        </View>

        {data.biography ? (
          <View className="mt-5">
            <Text className="mb-2 font-body-medium text-label-md uppercase text-primary">
              Biography
            </Text>
            <Text
              numberOfLines={bioOpen || !longBio ? undefined : 5}
              className="font-body text-body-md leading-6 text-on-surface-variant"
            >
              {data.biography}
            </Text>
            {longBio ? (
              <Pressable onPress={() => setBioOpen((v) => !v)} accessibilityRole="button">
                <Text className="mt-2 font-body-medium text-label-md text-primary">
                  {bioOpen ? "Show less" : "Read more"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View className="mt-6 flex-row gap-2">
          {TABS.map((t) => {
            const count = data[t.id].length;
            if (!count) return null;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === t.id }}
                className={`rounded-full px-3.5 py-2 active:opacity-80 ${
                  tab === t.id ? "bg-primary" : "border border-white/10 bg-surface-container/60"
                }`}
              >
                <Text
                  className={`font-body-medium text-[13px] ${
                    tab === t.id ? "text-on-primary" : "text-on-surface-variant"
                  }`}
                >
                  {t.label} {count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-5 flex-row flex-wrap justify-between gap-y-5">
          {credits.map((credit) => (
            <CreditCard
              key={credit.key}
              credit={credit}
              onPress={() => {
                // A `PersonCredit` is a `MediaItem` minus the fields the details
                // screen fetches anyway, so registering it lets that screen
                // render its poster and title on the first frame rather than
                // waiting on `/api/enrich`.
                registerItem({
                  key: credit.key,
                  tmdbId: credit.tmdbId,
                  title: credit.title,
                  kind: credit.kind,
                  poster: credit.poster,
                  year: credit.year,
                  releaseDate: credit.releaseDate,
                  rating: credit.rating,
                  voteCount: credit.voteCount,
                });
                router.push({
                  pathname: "/title/[key]",
                  params: { key: credit.key, kind: credit.kind },
                });
              }}
            />
          ))}
        </View>
      </MotiView>
    </ScrollView>
  );
}

function CreditCard({ credit, onPress }: { credit: PersonCredit; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${credit.title}`}
      className="w-[31%] active:opacity-80"
    >
      <PosterImage
        src={credit.poster}
        alt={credit.title}
        className="aspect-[2/3] w-full overflow-hidden rounded-poster"
      />
      <Text numberOfLines={2} className="mt-2 font-body-semibold text-[13px] text-on-surface">
        {credit.title}
      </Text>
      {credit.role ? (
        <Text numberOfLines={1} className="font-body text-[11px] text-on-surface-variant">
          {credit.role}
        </Text>
      ) : null}
    </Pressable>
  );
}
