import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import type { CreditedPerson, MediaItem } from "@cinesync/shared/types";
import { endpoints } from "@cinesync/shared/api";
import { useAppStore } from "@/store/useAppStore";
import { useTrailer } from "@/lib/useTrailer";
import { PosterImage } from "@/components/ui/PosterImage";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ScoresPanel } from "@/components/details/ScoresPanel";
import { brand, ON_SURFACE_VARIANT, PRIMARY } from "@/lib/theme";

/**
 * Whether two credit lines name the same people.
 *
 * Copied verbatim from the web's `DetailsModal`, punctuation squashing and all:
 * TMDB writes "D. B. Weiss" where IMDb writes "D.B. Weiss", and comparing the
 * raw strings would call that a second, different credit.
 */
function sameCredit(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const names = (v: string) =>
    new Set(
      v
        .split(",")
        .map((n) => n.replace(/[^a-z0-9]/gi, "").toLowerCase())
        .filter(Boolean),
    );
  const [x, y] = [names(a), names(b)];
  return x.size === y.size && [...x].every((n) => y.has(n));
}

export default function TitleScreen() {
  const params = useLocalSearchParams<{ key: string; imdbId?: string; kind?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const item = useAppStore((s) => s.items[params.key]);
  const inLibrary = useAppStore((s) =>
    item?.imdbId ? s.libraryIds.has(item.imdbId) : false,
  );
  const showToast = useAppStore((s) => s.showToast);
  const { play, pending: trailerPending } = useTrailer();

  const [fetched, setFetched] = useState<{ key: string; meta: MediaItem } | null>(null);
  const [coldError, setColdError] = useState<string | null>(null);

  /*
    Enrich, exactly as the web does.

    List endpoints carry no plot, genres or credits for some titles. Cinemeta
    fills in the prose and `/api/enrich` supplies TMDB credits carrying person
    ids, which is what makes the cast tappable rather than plain text.

    The `imdbId`/`kind` route params are the cold-start path: if the store has
    no entry for this key — a deep link, or Fast Refresh clearing the store —
    there is still enough to fetch the title rather than show an empty screen.
  */
  const imdbId = item?.imdbId ?? (params.imdbId || undefined);
  const kind = item?.kind ?? (params.kind as MediaItem["kind"] | undefined) ?? "movie";

  useEffect(() => {
    if (!imdbId && !item?.tmdbId) return;

    let cancelled = false;
    const url = imdbId
      ? endpoints.enrich({ imdb: imdbId, kind })
      : endpoints.enrich({ tmdb: item?.tmdbId, kind });

    void fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((meta: MediaItem | null) => {
        if (cancelled) return;
        if (meta) setFetched({ key: params.key, meta });
        else if (!item) setColdError("That title could not be loaded.");
      })
      .catch(() => {
        if (!cancelled && !item) setColdError("Could not reach the server.");
      });

    return () => {
      cancelled = true;
    };
  }, [imdbId, item, kind, params.key]);

  // The list item wins wherever it has a value — its poster is the textless
  // art deliberately picked during enrichment, and re-fetching would replace it
  // with the one that has the title burned into the image.
  const full: MediaItem | undefined =
    fetched?.key === params.key
      ? ({
          ...fetched.meta,
          ...Object.fromEntries(
            Object.entries(item ?? {}).filter(([, v]) => v !== undefined && v !== ""),
          ),
        } as MediaItem)
      : item;

  if (!full) {
    if (coldError) return <ErrorState message={coldError} onRetry={() => router.back()} />;
    return <LoadingState label="Loading title" />;
  }

  const meta = [full.year, full.genres?.slice(0, 3).join(", "), full.runtime].filter(Boolean);

  /*
    A series credits its creators once, not twice.

    `created_by` on a show already means "the people who wrote it", so a writing
    credit naming exactly those people is the same sentence under a second
    heading. A show whose writing credit is wider than its creators still says
    so, and a film always keeps both lines — writing and directing are separate
    credits even when one person holds both.
  */
  const showWriter =
    Boolean(full.writer) && !(full.kind === "series" && sameCredit(full.director, full.writer));

  const posterHeight = Math.round(width * 1.05);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 48 }}
    >
      {/* Poster header. The web shows a 38vh crop on mobile and a full poster
          beside the text on desktop; only the first has a counterpart here. */}
      <View style={{ height: posterHeight }} className="relative">
        <PosterImage src={full.poster ?? full.backdrop} alt={full.title} className="h-full w-full" />
        <LinearGradient
          colors={["transparent", "rgba(18,18,18,0.6)", "#121212"]}
          locations={[0, 0.6, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        />
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          className="absolute right-4 top-14 rounded-full bg-black/60 p-2.5 active:opacity-75"
        >
          <Icon name="close" size={22} color="#ffffff" />
        </Pressable>
      </View>

      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 260 }}
        className="-mt-8 px-margin-mobile"
      >
        {meta.length ? (
          <View className="mb-3 flex-row flex-wrap items-center gap-2">
            {meta.map((m, i) => (
              <View key={`${m}`} className="flex-row items-center gap-2">
                {i > 0 ? <View className="h-1 w-1 rounded-full bg-primary" /> : null}
                <Text className="font-body-medium text-label-md uppercase text-primary/80">{m}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="mb-5 font-display-bold text-[30px] leading-[36px] text-on-surface">
          {full.title}
        </Text>

        <View className="mb-7 flex-row flex-wrap gap-x-8 gap-y-4 border-b border-white/10 pb-6">
          {full.director ? (
            <CreditRow
              // "Creator" for a series, "Directors" for a co-directed film —
              // whichever credit the title actually carries, never a guess.
              label={full.directorLabel ?? "Director"}
              value={full.director}
            />
          ) : null}
          {showWriter ? (
            <CreditRow label={full.writerLabel ?? "Writer"} value={full.writer!} />
          ) : null}
          {full.rating ? (
            <View>
              <Text className="mb-1 font-body-medium text-label-md uppercase text-primary">Score</Text>
              <View className="flex-row items-center gap-1.5">
                <Icon name="star" size={16} color={brand.imdb} />
                <Text className="font-body-semibold text-body-md text-on-surface">{full.rating}</Text>
                <Text className="font-body text-[13px] text-on-surface-variant">/ 10</Text>
              </View>
            </View>
          ) : null}
          <CreditRow label="Type" value={full.kind === "series" ? "Series" : "Movie"} />
          {full.kind === "series" && full.episodeCount ? (
            <CreditRow
              label="Episodes"
              value={
                full.seasonCount
                  ? `${full.episodeCount} across ${full.seasonCount} ${
                      full.seasonCount === 1 ? "season" : "seasons"
                    }`
                  : String(full.episodeCount)
              }
            />
          ) : null}
        </View>

        <Section title="Synopsis">
          <Text className="font-body text-body-lg leading-[29px] text-on-surface-variant">
            {full.description || "No synopsis available for this title."}
          </Text>
        </Section>

        <CreditChips people={full.people} fallbackCast={full.cast} />

        <ScoresPanel imdbId={full.imdbId} tmdbId={full.tmdbId} kind={full.kind} />

        {full.genres?.length ? (
          <Section title="Genres">
            <View className="flex-row flex-wrap gap-2.5">
              {full.genres.map((g) => (
                <View
                  key={g}
                  className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5"
                >
                  <Text className="font-body-medium text-[13px] text-primary">{g}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <View className="mt-2 gap-3">
          <Pressable
            onPress={() => void play(full)}
            disabled={trailerPending}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 rounded-full bg-primary py-4 active:opacity-85 disabled:opacity-60"
          >
            <Icon name="play_arrow" size={20} color="#002113" />
            <Text className="font-body-semibold text-body-md text-on-primary-fixed">
              {trailerPending ? "Finding trailer…" : "Watch Trailer"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              // Adding to a library needs a connected Stremio account, and
              // account management is the Library tab, which is phase 3. Saying
              // so is better than a button that silently does nothing.
              showToast(
                inLibrary
                  ? "Already in your library"
                  : "Connect a Stremio account on the web app first",
              )
            }
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 rounded-full border border-white/15 py-4 active:opacity-75"
          >
            <Icon name={inLibrary ? "check" : "add"} size={20} color={PRIMARY} />
            <Text className="font-body-semibold text-body-md text-on-surface">
              {inLibrary ? "In Library" : "Add to Library"}
            </Text>
          </Pressable>
        </View>

        {full.imdbId ? (
          <Pressable
            onPress={() => void Linking.openURL(`https://www.imdb.com/title/${full.imdbId}/`)}
            accessibilityRole="link"
            className="mt-6 flex-row items-center gap-1.5 self-start active:opacity-70"
          >
            <Text className="font-body-medium text-label-md text-on-surface-variant">
              View on IMDb
            </Text>
            <Icon name="open_in_new" size={16} color={ON_SURFACE_VARIANT} />
          </Pressable>
        ) : null}
      </MotiView>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-7">
      <Text className="mb-3 font-body-medium text-label-md uppercase text-primary">{title}</Text>
      {children}
    </View>
  );
}

function CreditRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="mb-1 font-body-medium text-label-md uppercase text-primary">{label}</Text>
      <Text className="font-body text-body-md text-on-surface">{value}</Text>
    </View>
  );
}

/**
 * Cast and crew as tappable chips.
 *
 * Falls back to plain text when only names are known — a Cinemeta item whose
 * TMDB match could not be resolved has no person ids to navigate to, and a chip
 * that looks tappable but isn't is worse than a line of text.
 */
function CreditChips({ people, fallbackCast }: { people?: CreditedPerson[]; fallbackCast?: string }) {
  const router = useRouter();

  if (people?.length) {
    return (
      <Section title="Cast & Crew">
        <View className="flex-row flex-wrap gap-2">
          {people.map((p) => (
            <Pressable
              key={`${p.tmdbId}-${p.name}`}
              onPress={() =>
                router.push({ pathname: "/person/[id]", params: { id: String(p.tmdbId) } })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open ${p.name}`}
              className="rounded-full border border-white/10 bg-surface-container px-3 py-2 active:opacity-75"
            >
              <Text className="font-body text-[13px] text-on-surface">
                {p.name}
                {p.role ? (
                  <Text className="text-on-surface-variant"> · {p.role}</Text>
                ) : null}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>
    );
  }

  if (!fallbackCast) return null;

  return (
    <Section title="Cast">
      <Text className="font-body text-body-md text-on-surface-variant">{fallbackCast}</Text>
    </Section>
  );
}
