"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import type { DiscoverPayload } from "@/app/api/discover/route";
import { useFetch } from "@/lib/useFetch";
import { BecauseYouWatched } from "@/components/ui/BecauseYouWatched";
import { Carousel } from "@/components/ui/Carousel";
import { GemOfTheWeek } from "@/components/ui/GemOfTheWeek";
import { HeroSlider } from "@/components/ui/HeroSlider";
import { PosterCard } from "@/components/ui/PosterCard";
import { ErrorState, PosterSkeleton } from "@/components/ui/States";

const railVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export function DiscoverTab({ onWall }: { onWall: (posters: string[]) => void }) {
  const { data, loading, error, reload } = useFetch<DiscoverPayload>("/api/discover");

  // Feed the parallax poster wall behind the whole app.
  useEffect(() => {
    if (data?.wall?.length) onWall(data.wall);
  }, [data, onWall]);

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="pb-16">
      <HeroSlider items={data?.hero ?? []} />

      <div className="mx-auto mt-12 max-w-container-max px-margin-mobile md:px-margin-desktop">
        {/*
           Above the catalogue rails on purpose, and independent of them: it is
           seeded from the connected Stremio library rather than from
           `/api/discover`, so it neither waits for that payload nor blocks on
           it, and it renders nothing at all when there is nothing to say.
        */}
        <BecauseYouWatched />

        {/*
           Above the rails and below anything personal, which is where a
           standing recommendation belongs: it is not about you, so it does not
           outrank "because you watched", and it is one title rather than
           twenty, so putting it under a rail would bury it. Independent of
           `/api/discover` for the same reason the rail above it is — its own
           small request, its own failure, and nothing at all on screen when it
           has no answer.
        */}
        <GemOfTheWeek />

        {loading && !data ? (
          <Carousel title="Most Watched Movies" showArrows={false}>
            <PosterSkeleton />
          </Carousel>
        ) : (
          data?.rails.map((rail) => (
            <Carousel key={rail.title} title={rail.title}>
              <motion.div
                className="flex gap-[18px]"
                variants={railVariants}
                initial="hidden"
                animate="show"
              >
                {rail.items.map((item) => (
                  <PosterCard key={item.key} item={item} />
                ))}
              </motion.div>
            </Carousel>
          ))
        )}
      </div>
    </div>
  );
}
