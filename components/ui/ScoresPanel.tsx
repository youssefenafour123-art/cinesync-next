"use client";

import { useState } from "react";
import type { Scores } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { Icon } from "./Icon";

type Payload = Scores & { omdbConfigured?: boolean };

/**
 * Ratings and reviews.
 *
 * Aggregate scores come from OMDb and are labelled with their real sources
 * (Rotten Tomatoes, Metacritic, IMDb). Written reviews come from TMDB and are
 * labelled as community reviews — deliberately never presented as press
 * criticism, which is what the legacy page did with invented "The Empire" and
 * "New York Times" blurbs.
 */
export function ScoresPanel({
  imdbId,
  tmdbId,
  kind,
}: {
  imdbId?: string;
  tmdbId?: number;
  kind: "movie" | "series";
}) {
  const query = imdbId
    ? `/api/scores/${imdbId}?kind=${kind}${tmdbId ? `&tmdb=${tmdbId}` : ""}`
    : null;
  const { data, loading } = useFetch<Payload>(query);

  if (!imdbId) return null;
  if (loading) {
    return (
      <div className="mb-8 h-24 animate-pulse rounded-DEFAULT border border-white/5 bg-surface-container/40" />
    );
  }
  if (!data) return null;

  const hasScores = data.rottenTomatoes || data.metacritic || data.imdb;

  return (
    <div className="mb-10">
      {hasScores ? (
        <>
          <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
            Critic &amp; Audience Scores
          </h3>
          <div className="mb-6 flex flex-wrap gap-3">
            {data.rottenTomatoes ? (
              <ScoreChip
                label="Rotten Tomatoes"
                value={data.rottenTomatoes}
                tone={parseInt(data.rottenTomatoes, 10) >= 60 ? "good" : "bad"}
              />
            ) : null}
            {data.metacritic ? (
              <ScoreChip
                label="Metacritic"
                value={data.metacritic}
                tone={parseInt(data.metacritic, 10) >= 61 ? "good" : "bad"}
              />
            ) : null}
            {data.imdb ? (
              <ScoreChip
                label="IMDb"
                value={`${data.imdb.value}/10`}
                sub={data.imdb.votes ? `${data.imdb.votes} votes` : undefined}
                tone="neutral"
              />
            ) : null}
          </div>
        </>
      ) : data.omdbConfigured === false ? (
        <p className="mb-6 rounded-DEFAULT border border-white/10 bg-surface-container/40 p-3 font-body-md text-[13px] text-on-surface-variant">
          Add <code className="text-primary">OMDB_API_KEY</code> to{" "}
          <code className="text-primary">.env.local</code> for Rotten Tomatoes and Metacritic
          scores.{" "}
          <a
            href="https://www.omdbapi.com/apikey.aspx"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Free key
          </a>
          .
        </p>
      ) : null}

      {data.reviews.length > 0 ? <Reviews reviews={data.reviews} /> : null}
    </div>
  );
}

function ScoreChip({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "good" | "bad" | "neutral";
}) {
  const ring =
    tone === "good"
      ? "border-primary/40 bg-primary/10"
      : tone === "bad"
        ? "border-error/40 bg-error/10"
        : "border-white/15 bg-white/5";
  const text = tone === "good" ? "text-primary" : tone === "bad" ? "text-error" : "text-on-surface";

  return (
    <div className={`rounded-DEFAULT border px-4 py-2.5 ${ring}`}>
      <div className={`font-title-lg text-title-lg ${text}`}>{value}</div>
      <div className="font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant">
        {label}
      </div>
      {sub ? <div className="text-[11px] text-on-surface-variant/70">{sub}</div> : null}
    </div>
  );
}

function Reviews({ reviews }: { reviews: Scores["reviews"] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <>
      <h3 className="mb-1 font-label-md text-label-md uppercase tracking-widest text-primary">
        Community Reviews
      </h3>
      <p className="mb-4 font-body-md text-[12px] text-on-surface-variant/70">
        Written by TMDB members — not press critics.
      </p>

      <div className="flex flex-col gap-3">
        {reviews.map((r, i) => {
          const expanded = open === i;
          return (
            <div
              key={`${r.author}-${i}`}
              className="rounded-lg border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/[0.07]"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
                    {r.author.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-label-md text-label-md font-bold text-on-surface">
                      {r.author}
                    </div>
                    {r.createdAt ? (
                      <div className="text-xs text-on-surface-variant">
                        {new Date(r.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
                {typeof r.rating === "number" ? (
                  <div className="shrink-0 rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
                    {r.rating} / 10
                  </div>
                ) : null}
              </div>

              <p
                className={`whitespace-pre-line font-body-md text-[14px] leading-relaxed text-on-surface-variant ${
                  expanded ? "" : "line-clamp-4"
                }`}
              >
                {r.content}
              </p>

              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : i)}
                  className="font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
                >
                  {expanded ? "Show less" : "Read full review"}
                </button>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
                  >
                    Source
                    <Icon name="open_in_new" className="text-[14px]" />
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
