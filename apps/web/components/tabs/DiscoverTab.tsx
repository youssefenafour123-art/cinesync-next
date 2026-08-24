"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import type { DiscoverPayload } from "@/app/api/discover/route";
import { useFetch } from "@/lib/useFetch";
import { BecauseYouWatched } from "@/components/ui/BecauseYouWatched";
import { Carousel } from "@/components/ui/Carousel";
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
