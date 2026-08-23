import { useCallback } from "react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import type { MediaItem } from "@cinesync/shared/types";
import { useAppStore } from "@/store/useAppStore";

/**
 * Opens a title's details screen.
 *
 * Every card in the app goes through here rather than calling `router.push`
 * itself, for two reasons.
 *
 * The item is registered in the store first, so `/title/[key]` can render the
 * poster and heading on its very first frame instead of waiting for
 * `/api/enrich`. That is what the web's details modal does too — it renders the
 * list item immediately and merges the enrichment underneath it — and losing it
 * would turn every tap into a visible pause.
 *
 * And it is `push`, never `navigate`. `navigate` deduplicates by route, so a
 * film → cast member → another film chain would collapse the second film onto
 * the first instead of stacking, and going back would land on the wrong screen.
 */
export function useOpenTitle() {
  const router = useRouter();
  const registerItem = useAppStore((s) => s.registerItem);

  return useCallback(
    (item: MediaItem) => {
      registerItem(item);
      void Haptics.selectionAsync();
      router.push({
        pathname: "/title/[key]",
        // `imdbId` and `kind` ride along so a cold open of this route — a deep
        // link, or a Fast Refresh that cleared the store — can still fetch the
        // title rather than showing an empty screen.
        params: { key: item.key, imdbId: item.imdbId ?? "", kind: item.kind },
      });
    },
    [registerItem, router],
  );
}
