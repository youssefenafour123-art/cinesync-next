import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import type { MediaItem } from "@cinesync/shared/types";
import { endpoints } from "@cinesync/shared/api";
import { useAppStore } from "@/store/useAppStore";

/**
 * Resolves a title's trailer and opens the player.
 *
 * Ported from `apps/web/lib/useTrailer.ts`, including the part that matters:
 * when there is no trailer the user is told so. The legacy app fell back to
 * playing *something* — a different film's trailer, or a clip — which is worse
 * than saying nothing is available, because it looks like it worked.
 */
export function useTrailer() {
  const router = useRouter();
  const showToast = useAppStore((s) => s.showToast);
  const [pending, setPending] = useState(false);

  const play = useCallback(
    async (item: MediaItem) => {
      if (item.trailerKey) {
        router.push({ pathname: "/trailer/[videoId]", params: { videoId: item.trailerKey } });
        return;
      }
      if (!item.imdbId && !item.tmdbId) {
        showToast("No trailer available");
        return;
      }

      setPending(true);
      try {
        const res = await fetch(
          endpoints.enrich(
            item.imdbId ? { imdb: item.imdbId, kind: item.kind } : { tmdb: item.tmdbId, kind: item.kind },
          ),
        );
        const meta = res.ok ? ((await res.json()) as MediaItem) : null;
        if (meta?.trailerKey) {
          router.push({ pathname: "/trailer/[videoId]", params: { videoId: meta.trailerKey } });
        } else {
          showToast("No trailer available");
        }
      } catch {
        showToast("Could not reach the trailer service");
      } finally {
        setPending(false);
      }
    },
    [router, showToast],
  );

  return { play, pending };
}
