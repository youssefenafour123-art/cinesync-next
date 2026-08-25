"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Person, PersonCredit } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";
import { PosterImage } from "@/components/ui/PosterImage";
import { FollowPersonButton } from "@/components/profile/FollowPersonButton";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ModalShell } from "./ModalShell";

type Panel = "known" | "upcoming" | "filmography";

/** The filmography filter. "all" is the default and keeps the old behaviour. */
type KindFilter = "all" | "movie" | "series";

const KIND_LABELS: Record<KindFilter, string> = {
  all: "All",
  movie: "Movies",
  series: "TV Shows",
};

/** Person profile: bio, career summary, upcoming work and full filmography. */
export function PersonModal({ id }: { id: number }) {
  const close = useAppStore((s) => s.closePerson);
  const { data, loading, error, reload } = useFetch<Person>(`/api/person/${id}`);
  const [panel, setPanel] = useState<Panel>("known");
  const [kind, setKind] = useState<KindFilter>("all");

  /*
     A profile opened from another profile's credits reuses this component
     rather than remounting it — `openPerson` only swaps the id — so without
     this, arriving at a new person would inherit the previous one's panel and
     filter, and could land on an empty grid.
  */
  useEffect(() => {
    setPanel("known");
    setKind("all");
  }, [id]);

  const filmography = data?.filmography;
  const counts = useMemo(() => {
    const credits = filmography ?? [];
    return {
      all: credits.length,
      movie: credits.filter((c) => c.kind === "movie").length,
      series: credits.filter((c) => c.kind === "series").length,
    };
  }, [filmography]);

  // Nothing to filter when the whole career is one kind — a film-only director
  // should not be offered a TV Shows chip that leads somewhere empty.
  const showKindFilter = counts.movie > 0 && counts.series > 0;
  const activeKind = showKindFilter ? kind : "all";

  return (
    <ModalShell
      onClose={close}
      label={data ? `Profile for ${data.name}` : "Person profile"}
      className="glass-panel panel-glow max-w-5xl rounded-xl"
    >
      {loading && !data ? (
        <LoadingState label="Loading profile…" />
      ) : error || !data ? (
        <ErrorState message={error ?? "Couldn't load that profile."} onRetry={reload} />
      ) : (
        <div className="custom-scrollbar overflow-y-auto p-6 md:p-10">
          <Header person={data} />

          {data.biography ? <Biography text={data.biography} /> : null}

          <div className="mt-8 flex flex-wrap gap-2 border-b border-white/10 pb-4">
            <Tab id="known" active={panel} set={setPanel} count={data.knownFor.length}>
              Known For
            </Tab>
            <Tab id="upcoming" active={panel} set={setPanel} count={data.upcoming.length}>
              Upcoming
            </Tab>
            <Tab id="filmography" active={panel} set={setPanel} count={data.filmography.length}>
              Filmography
            </Tab>
          </div>

          {panel === "filmography" && showKindFilter ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {(["all", "movie", "series"] as const).map((k) => (
                <Chip key={k} on={activeKind === k} onClick={() => setKind(k)} count={counts[k]}>
                  {KIND_LABELS[k]}
                </Chip>
              ))}
            </div>
          ) : null}

          <CreditGrid
            credits={
              panel === "known"
                ? data.knownFor
                : panel === "upcoming"
                  ? data.upcoming
                  : activeKind === "all"
                    ? data.filmography
                    : data.filmography.filter((c) => c.kind === activeKind)
            }
            emptyMessage={
              panel === "upcoming"
                ? `No announced projects for ${data.name} right now.`
                : "Nothing to show here."
            }
          />
        </div>
      )}
    </ModalShell>
  );
}

function Header({ person }: { person: Person }) {
  const life = [person.birthday, person.deathday].filter(Boolean).join(" – ");

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <PosterImage
        src={person.profile}
        alt={person.name}
        className="h-40 w-40 shrink-0 rounded-2xl object-cover shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
      />
      <div className="min-w-0 flex-1">
        <h1 className="font-display-md text-headline-lg text-on-surface md:text-display-md">
          {person.name}
        </h1>
        {person.department ? (
          <p className="mt-1 font-label-md text-label-md uppercase tracking-widest text-primary">
            {person.department}
          </p>
        ) : null}

        {/*
           Following a person is followed *work*, not a social connection —
           there is no account behind Denis Villeneuve here — so it sits with
           the biography rather than anywhere near the follower counts on a
           profile.
        */}
        <div className="mt-4">
          <FollowPersonButton person={person} />
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-body-md text-[14px]">
          {life ? (
            <div>
              <dt className="text-on-surface-variant">Born</dt>
              <dd className="text-on-surface">{life}</dd>
            </div>
          ) : null}
          {person.placeOfBirth ? (
            <div className="min-w-0">
              <dt className="text-on-surface-variant">From</dt>
              <dd className="truncate text-on-surface">{person.placeOfBirth}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-on-surface-variant">Credits</dt>
            <dd className="text-on-surface">{person.filmography.length + person.upcoming.length}</dd>
          </div>
        </dl>

        {person.imdbId ? (
          <a
            href={`https://www.imdb.com/name/${person.imdbId}/`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
          >
            View on IMDb
            <Icon name="open_in_new" className="text-[16px]" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Biography({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 420;

  return (
    <div className="mt-8">
      <h3 className="mb-3 font-label-md text-label-md uppercase tracking-widest text-primary">
        Biography
      </h3>
      <p
        className={`whitespace-pre-line font-body-md text-[15px] leading-relaxed text-on-surface-variant ${
          long && !expanded ? "line-clamp-5" : ""
        }`}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

/** The one chip, so the panel row and the kind row cannot drift apart. */
function Chip({
  on,
  onClick,
  count,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${
        on
          ? "bg-primary text-on-primary"
          : "border border-white/10 text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {children}
      <span className={on ? "ml-1.5 opacity-70" : "ml-1.5 opacity-50"}>{count}</span>
    </button>
  );
}

function Tab({
  id,
  active,
  set,
  count,
  children,
}: {
  id: Panel;
  active: Panel;
  set: (p: Panel) => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Chip on={active === id} onClick={() => set(id)} count={count}>
      {children}
    </Chip>
  );
}

function CreditGrid({
  credits,
  emptyMessage,
}: {
  credits: PersonCredit[];
  emptyMessage: string;
}) {
  const openDetailsByTmdb = useAppStore((s) => s.openDetails);

  if (!credits.length) {
    return (
      <p className="py-12 text-center font-body-md text-body-md text-on-surface-variant">
        {emptyMessage}
      </p>
    );
  }

  return (
    <motion.div
      className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
      initial="hidden"
      animate="show"
    >
      {credits.map((c) => (
        <motion.button
          key={c.key}
          type="button"
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
          whileHover={{ y: -6 }}
          onClick={() =>
            // Credits carry no IMDb id, so hand the modal what we have and let
            // it resolve the rest from TMDB.
            openDetailsByTmdb({
              key: `tmdb:${c.tmdbId}`,
              tmdbId: c.tmdbId,
              title: c.title,
              kind: c.kind,
              poster: c.poster,
              year: c.year,
              releaseDate: c.releaseDate,
              rating: c.rating,
              voteCount: c.voteCount,
            })
          }
          className="text-left"
        >
          <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/5 bg-surface-container">
            <PosterImage src={c.poster} alt={c.title} className="h-full w-full object-cover" />
          </div>
          <h4 className="mt-2 truncate font-title-lg text-[14px] text-on-surface">{c.title}</h4>
          <p className="truncate text-[12px] text-on-surface-variant">
            {c.year ?? "TBA"}
            {c.role ? ` · ${c.role}` : ""}
          </p>
        </motion.button>
      ))}
    </motion.div>
  );
}
