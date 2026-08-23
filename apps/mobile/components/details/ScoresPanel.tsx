import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { MediaKind, Scores } from "@cinesync/shared/types";
import { endpoints } from "@cinesync/shared/api";
import { useFetch } from "@/lib/useFetch";
import { brand } from "@/lib/theme";

/**
 * Ratings and reviews for one title.
 *
 * The web panel keeps three things carefully apart and this does too, because
 * conflating them is exactly the bug it was built to fix — the legacy page
 * filled a "critics" rail with invented blurbs attributed to real outlets.
 *
 *  - aggregate scores (Rotten Tomatoes, Metacritic, IMDb)
 *  - the Rotten Tomatoes critics' consensus, quoted as a consensus
 *  - named press critics, credited to the Wikipedia article they came from
 *
 * TMDB *member* reviews, which the web shows as a fourth section, are left out
 * here: they run to several paragraphs each and sit below an already long
 * scroll. They are the least load-bearing part of the panel, and the phone is
 * where cutting matters.
 */

const RT_GOOD = 60;
const MC_GOOD = 61;

export function ScoresPanel({
  imdbId,
  tmdbId,
  kind,
}: {
  imdbId?: string;
  tmdbId?: number;
  kind: MediaKind;
}) {
  const id = imdbId ?? (tmdbId ? String(tmdbId) : null);
  const { data } = useFetch<Scores & { omdbConfigured?: boolean }>(
    id ? endpoints.scores(id, kind, imdbId ? undefined : tmdbId) : null,
  );
  const [showAllCritics, setShowAllCritics] = useState(false);

  if (!data) return null;

  const chips = [
    data.rottenTomatoes
      ? {
          label: "Rotten Tomatoes",
          value: data.rottenTomatoes,
          count: data.rottenTomatoesCount,
          good: parseInt(data.rottenTomatoes, 10) >= RT_GOOD,
        }
      : null,
    data.metacritic
      ? {
          label: "Metacritic",
          value: data.metacritic,
          count: data.metacriticCount ?? data.metacriticLabel,
          good: parseInt(data.metacritic, 10) >= MC_GOOD,
        }
      : null,
    data.imdb
      ? { label: "IMDb", value: data.imdb.value, count: data.imdb.votes, good: true }
      : null,
  ].filter(Boolean) as {
    label: string;
    value: string;
    count?: string;
    good: boolean;
  }[];

  if (!chips.length && !data.consensus && !data.critics.length) return null;

  const critics = showAllCritics ? data.critics : data.critics.slice(0, 4);

  return (
    <View className="mb-7">
      <Text className="mb-3 font-body-medium text-label-md uppercase text-primary">Reception</Text>

      {chips.length ? (
        <View className="mb-4 flex-row flex-wrap gap-2">
          {chips.map((c) => (
            <View
              key={c.label}
              className={`rounded-2xl border px-3.5 py-2.5 ${
                c.good ? "border-primary/30 bg-primary/10" : "border-white/10 bg-surface-container"
              }`}
            >
              <Text
                className="font-body text-[11px] uppercase"
                style={{ color: c.label === "IMDb" ? brand.imdb : undefined }}
              >
                {c.label}
              </Text>
              <Text className="font-body-semibold text-body-md text-on-surface">{c.value}</Text>
              {c.count ? (
                <Text className="font-body text-[11px] text-on-surface-variant">{c.count}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {data.consensus ? (
        <View className="mb-4 rounded-2xl border-l-2 border-primary/50 bg-surface-container/60 px-4 py-3">
          <Text className="font-body text-body-md italic leading-6 text-on-surface-variant">
            {data.consensus}
          </Text>
          <Text className="mt-2 font-body text-[11px] uppercase text-on-surface-variant/70">
            Rotten Tomatoes critics’ consensus
          </Text>
        </View>
      ) : null}

      {critics.length ? (
        <View className="gap-3">
          {critics.map((c) => (
            <View key={`${c.critic}-${c.publication}`} className="flex-row gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-high">
                <Text className="font-body-semibold text-[12px] text-on-surface-variant">
                  {c.critic
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-body-semibold text-[13px] text-on-surface">
                  {c.critic}
                  <Text className="font-body text-on-surface-variant"> · {c.publication}</Text>
                  {c.stars ? (
                    <Text className="font-body text-on-surface-variant"> · {c.stars}</Text>
                  ) : null}
                </Text>
                <Text className="mt-0.5 font-body text-[13px] leading-5 text-on-surface-variant">
                  {c.excerpt}
                </Text>
              </View>
            </View>
          ))}

          {data.critics.length > 4 ? (
            <Pressable onPress={() => setShowAllCritics((v) => !v)} accessibilityRole="button">
              <Text className="font-body-medium text-label-md text-primary">
                {showAllCritics ? "Show fewer" : `Show all ${data.critics.length}`}
              </Text>
            </Pressable>
          ) : null}

          {data.criticsSourceTitle ? (
            <Text className="mt-1 font-body text-[11px] text-on-surface-variant/70">
              Summarised from the Wikipedia article “{data.criticsSourceTitle}”
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
