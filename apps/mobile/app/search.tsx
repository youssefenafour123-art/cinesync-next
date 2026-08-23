import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MediaItem, SearchResults } from "@cinesync/shared/types";
import { endpoints } from "@cinesync/shared/api";
import { useFetch } from "@/lib/useFetch";
import { useOpenTitle } from "@/lib/useOpenTitle";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { Chip } from "@/components/ui/Chip";
import { ON_SURFACE_VARIANT, PRIMARY } from "@/lib/theme";

const DEBOUNCE_MS = 350;
const QUICK_LIMIT = 6;
const PEOPLE_LIMIT = 3;
const RECENT_KEY = "cinesync:recent-searches";
const RECENT_MAX = 8;
/** The route handler rejects anything shorter, so don't ask. */
const MIN_QUERY = 2;

/**
 * Search.
 *
 * The web modal starts compact and grows when you press Enter — six quick
 * results, then the full set. That distinction doesn't survive: a phone screen
 * is already the "compact" size, and there is nothing for the panel to grow
 * into. So this shows one list, and submitting the keyboard just dismisses it
 * to give the results the whole screen.
 *
 * Kept from the web: the 350ms debounce, the two-character floor, and the
 * recent-search chips, which move from localStorage to AsyncStorage under the
 * same key.
 */
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openTitle = useOpenTitle();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    void AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (raw) setRecent(JSON.parse(raw) as string[]);
      })
      .catch(() => {
        // A corrupt or unreadable entry just means no chips this session.
      });
  }, []);

  const remember = useCallback((term: string) => {
    setRecent((prev) => {
      const next = [term, ...prev.filter((t) => t !== term)].slice(0, RECENT_MAX);
      void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const active = debounced.length >= MIN_QUERY;
  const { data, loading } = useFetch<SearchResults>(active ? endpoints.search(debounced) : null);

  const titles = data?.titles ?? [];
  const people = (data?.people ?? []).slice(0, PEOPLE_LIMIT);

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2 px-margin-mobile pb-3">
        <View className="flex-1 flex-row items-center gap-2 rounded-full bg-[#181818] px-4 py-3">
          <Icon name="search" size={20} color={ON_SURFACE_VARIANT} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => {
              if (active) remember(debounced);
              Keyboard.dismiss();
            }}
            placeholder="Search films, series and people"
            placeholderTextColor={ON_SURFACE_VARIANT}
            selectionColor={PRIMARY}
            className="flex-1 font-body text-body-md text-on-surface"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
              <Icon name="close" size={18} color={ON_SURFACE_VARIANT} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text className="font-body-medium text-body-md text-primary">Cancel</Text>
        </Pressable>
      </View>

      {!active ? (
        recent.length ? (
          <View className="px-margin-mobile pt-4">
            <Text className="mb-3 font-body-medium text-label-md uppercase text-primary">Recent</Text>
            <View className="flex-row flex-wrap gap-2">
              {recent.map((term) => (
                <Chip key={term} label={term} selected={false} onPress={() => setQuery(term)} />
              ))}
            </View>
          </View>
        ) : (
          <EmptyState icon="travel_explore" message="Type at least two characters to search." />
        )
      ) : loading && !data ? (
        <LoadingState label="Searching" />
      ) : !titles.length && !people.length ? (
        <EmptyState message={`Nothing found for “${debounced}”.`} />
      ) : (
        <FlatList
          data={titles.slice(0, QUICK_LIMIT * 4)}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            people.length ? (
              <View className="mb-2 px-margin-mobile pt-2">
                <Text className="mb-3 font-body-medium text-label-md uppercase text-primary">
                  People
                </Text>
                <View className="gap-2">
                  {people.map((p) => (
                    <Pressable
                      key={p.tmdbId}
                      onPress={() =>
                        router.push({ pathname: "/person/[id]", params: { id: String(p.tmdbId) } })
                      }
                      accessibilityRole="button"
                      className="flex-row items-center gap-3 rounded-2xl bg-surface-container/60 p-2 active:opacity-75"
                    >
                      <PosterImage
                        src={p.profile}
                        alt={p.name}
                        className="h-12 w-12 overflow-hidden rounded-full"
                      />
                      <View className="flex-1">
                        <Text className="font-body-semibold text-body-md text-on-surface">
                          {p.name}
                        </Text>
                        <Text numberOfLines={1} className="font-body text-[12px] text-on-surface-variant">
                          {[p.department, p.knownFor].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
                <Text className="mb-1 mt-5 font-body-medium text-label-md uppercase text-primary">
                  Titles
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ResultRow
              item={item}
              onPress={() => {
                remember(debounced);
                openTitle(item);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

/** Future-dated titles are badged, same as the web's `isUpcoming()`. */
function isUpcoming(item: MediaItem): boolean {
  if (!item.releaseDate) return false;
  const when = new Date(item.releaseDate);
  return !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
}

function ResultRow({ item, onPress }: { item: MediaItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      className="mx-margin-mobile mb-2 flex-row items-center gap-3 rounded-2xl bg-surface-container/60 p-2 active:opacity-75"
    >
      <PosterImage
        src={item.poster}
        alt={item.title}
        className="h-[72px] w-12 overflow-hidden rounded-lg"
      />
      <View className="flex-1">
        <Text numberOfLines={1} className="font-body-semibold text-body-md text-on-surface">
          {item.title}
        </Text>
        <Text className="mt-0.5 font-body text-[12px] text-on-surface-variant">
          {[item.year ?? "TBA", item.kind === "series" ? "Series" : "Film"].join(" • ")}
        </Text>
      </View>
      {isUpcoming(item) ? (
        <View className="rounded-full bg-secondary/20 px-2 py-1">
          <Text className="font-body-medium text-[11px] text-secondary">Upcoming</Text>
        </View>
      ) : item.rating ? (
        <Text className="font-body-semibold text-[13px] text-on-surface-variant">{item.rating}</Text>
      ) : null}
    </Pressable>
  );
}
