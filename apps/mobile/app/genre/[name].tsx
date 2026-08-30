import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MotiView } from "moti";
import type { GenrePayload } from "@cinesync/shared/payloads";
import type { MediaItem, MediaKind } from "@cinesync/shared/types";
import { endpoints, fetchJson } from "@cinesync/shared/api";
import { useFetch } from "@/lib/useFetch";
import { PosterCard } from "@/components/ui/PosterCard";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/States";
import { ON_SURFACE_VARIANT } from "@/lib/theme";

const NOUN: Record<MediaKind, string> = { movie: "films", series: "series" };

/** Placeholder cells while the first slice is assembled — one screen's worth. */
const SKELETONS = 6;

/**
 * One genre, opened from a genre chip on a title.
 *
 * The web's `GenreModal`, as a screen. Everything that decides *what* is on it
 * belongs to `/api/genre` and is shared with the web verbatim — the vote floor,
 * the weighted ranking, the tiering that puts the titles a genre actually
 * describes ahead of the ones that merely carry it, and the two awkward facts
 * the route exists to absorb: TMDB and IMDb do not name genres the same way,
 * and TMDB's film and television vocabularies are not the same list.
 */
export default function GenreScreen() {
  const { name, kind } = useLocalSearchParams<{ name: string; kind?: MediaKind }>();
  const router = useRouter();

  /*
    The catalogue to try first, from the title the chip was pressed on. A
    request, not a guarantee — see `answered`.

    Initial state only. Pressing a chip pushes a screen, so a second genre is a
    second instance of this component rather than new props on this one.
  */
  const [asked, setAsked] = useState<MediaKind>(kind === "series" ? "series" : "movie");

  const { data, loading, error, reload } = useFetch<GenrePayload>(
    endpoints.genre(name ?? "", asked),
  );

  /*
    Everything Show more has fetched, tagged with the catalogue it belongs to.

    Tagged rather than cleared so switching to Movies does not need an effect
    watching `asked` — the render works it out, and flipping back is a cache
    hit on URLs already fetched.
  */
  const [more, setMore] = useState<{ forKind: MediaKind; page: number; items: MediaItem[] }>({
    forKind: asked,
    page: 1,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // The most recent slice knows whether another exists; `data` only ever
  // describes page one.
  const [last, setLast] = useState<GenrePayload | null>(null);

  const mine = more.forKind === asked ? more : { forKind: asked, page: 1, items: [] };
  const tail = last && last.genre?.kind === data?.genre?.kind ? last : data;

  const showMore = useCallback(async () => {
    const next = mine.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const payload = await fetchJson<GenrePayload>(endpoints.genre(name ?? "", asked, next));
      setMore({ forKind: asked, page: next, items: [...mine.items, ...payload.items] });
      setLast(payload);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [asked, mine.items, mine.page, name]);

  const genre = data?.genre ?? null;
  const items = [...(data?.items ?? []), ...mine.items];

  /*
     What actually came back, rather than what was asked for.

     Both can differ. A chip can carry Cinemeta's IMDb wording, TMDB's film and
     television vocabularies name the same genre differently, and TMDB keeps
     Thriller on the film side only — so a Thriller chip on a series answers
     with films. Captioning the screen from the request would name a page it is
     not showing.
  */
  const answered: MediaKind = genre?.kind ?? asked;
  const title = genre?.name ?? name ?? "";
  const substituted = Boolean(genre) && genre!.kind !== asked;
  const renamed = Boolean(genre) && genre!.name.toLowerCase() !== (name ?? "").trim().toLowerCase();

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
        <Text className="font-body-medium text-label-md uppercase text-primary">Genre</Text>
        <Text className="mt-1 font-display-bold text-[30px] leading-9 text-on-surface">{title}</Text>
        <Text className="mt-2 font-body text-body-md leading-6 text-on-surface-variant">
          The best {NOUN[answered]} TMDB files under {title}, ranked by weighted rating and led by
          the ones the genre actually describes.
        </Text>

        {/* Said out loud when the screen is the nearest real one rather than
            the one that was asked for. It says what happened and not why: a
            chip can carry Cinemeta's IMDb wording, and TMDB's own film and
            television vocabularies can simply differ. */}
        {substituted || renamed ? (
          <View className="mt-3 rounded-xl border border-white/10 bg-surface-container/40 px-4 py-3">
            <Text className="font-body text-[13px] leading-5 text-on-surface-variant">
              {substituted && renamed
                ? `You pressed “${name}”. TMDB files those titles under ${title}, and only on the ${answered === "movie" ? "film" : "television"} side — so these are ${NOUN[answered]}.`
                : substituted
                  ? `TMDB files ${title} as a ${answered === "movie" ? "film" : "television"} genre only, so these are ${NOUN[answered]}.`
                  : `You pressed “${name}”. TMDB files these titles under ${title}.`}
            </Text>
          </View>
        ) : null}

        {/* Only where TMDB genuinely keeps the genre in both vocabularies. It
            always asks by the chip's original name, never the resolved one, so
            switching cannot strand you between Action and Action & Adventure. */}
        {data?.counterpart ? (
          <View className="mt-5 flex-row gap-2">
            {(["movie", "series"] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setAsked(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: answered === k }}
                className={`rounded-full px-4 py-2 active:opacity-80 ${
                  answered === k ? "bg-primary" : "border border-white/10 bg-surface-container/60"
                }`}
              >
                <Text
                  className={`font-body-medium text-[13px] ${
                    answered === k ? "text-on-primary" : "text-on-surface-variant"
                  }`}
                >
                  {k === "series" ? "TV Shows" : "Movies"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View className="mt-7">
          {error && !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            /* The shape of the answer while it is being worked out — a genre
               is assembled, not looked up, and the first viewer in an hour
               waits for it. Cells already the right size mean nothing moves
               when the posters land. */
            <View className="flex-row flex-wrap justify-between gap-y-6" accessibilityLabel={`Finding the best of ${title}`}>
              {Array.from({ length: SKELETONS }).map((_, i) => (
                <View key={i} className="w-[48%]">
                  <View className="aspect-[2/3] rounded-[14px] bg-surface-container opacity-60" />
                </View>
              ))}
            </View>
          ) : !genre ? (
            /* A chip TMDB has no genre for at all — IMDb sorts by Biography,
               Film-Noir, Sport and Short, and TMDB does not. Nothing is broken
               and there is nothing to retry. */
            <Text className="px-4 py-10 text-center font-body text-body-md leading-6 text-on-surface-variant">
              TMDB doesn’t sort titles by {name}. That chip comes from IMDb’s list of genres, which
              is the longer of the two — there is no page to show behind it.
            </Text>
          ) : items.length === 0 ? (
            <Text className="px-4 py-10 text-center font-body text-body-md leading-6 text-on-surface-variant">
              Nothing in {title} clears the bar on the{" "}
              {answered === "series" ? "television" : "film"} side — the genre exists, but TMDB has
              too few well-rated titles in it to fill a page.
            </Text>
          ) : (
            <View
              // Keyed on the catalogue so switching cross-fades the grid rather
              // than swapping posters in place, which reads as images failing.
              key={`${title}-${answered}`}
              className="flex-row flex-wrap justify-between gap-y-6"
            >
              {items.map((item, i) => (
                <View key={item.key} className="w-[48%]">
                  <PosterCard item={item} variant="grid" index={i} />
                </View>
              ))}
            </View>
          )}

          {/* More of the same genre, read on from where this slice stopped
              rather than re-sorted from a wider pool — nothing already on
              screen moves. Fetched on the press: most people never ask. */}
          {genre && items.length > 0 && tail?.hasMore ? (
            <View className="mt-7 items-center gap-3">
              {moreError ? (
                <Text className="font-body text-[13px] text-error">{moreError}</Text>
              ) : null}
              <Pressable
                onPress={showMore}
                disabled={loadingMore}
                accessibilityRole="button"
                className={`rounded-full border border-white/10 bg-surface-container/60 px-7 py-3 active:opacity-80 ${
                  loadingMore ? "opacity-60" : ""
                }`}
              >
                <Text className="font-body-medium text-label-md text-on-surface-variant">
                  {loadingMore ? "Finding more…" : moreError ? "Try again" : "Show more"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </MotiView>
    </ScrollView>
  );
}
