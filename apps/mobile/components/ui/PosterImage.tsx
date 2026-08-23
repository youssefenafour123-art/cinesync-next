import { Image } from "expo-image";
import { View } from "react-native";
import { useState } from "react";
import { Icon } from "./Icon";
import { ON_SURFACE_VARIANT, POSTER_PLACEHOLDER } from "@/lib/theme";

interface PosterImageProps {
  src?: string;
  alt: string;
  /** NativeWind classes for the image box. Callers set the aspect ratio here. */
  className?: string;
  /** `expo-image`'s cross-fade, in ms. */
  transition?: number;
  contentFit?: "cover" | "contain";
}

/**
 * A poster, with the same fallback the web app draws when the URL is dead.
 *
 * The web deliberately uses a raw `<img>` rather than `next/image`, because
 * posters come from TMDB, Cinemeta and Metahub and none of those hosts are in
 * the Next image config. `expo-image` has no such restriction and brings two
 * things the web version had to do without: a real disk cache, which is what
 * makes a rail scroll smoothly on a second visit, and a built-in cross-fade so
 * a decoded poster doesn't snap into place.
 */
export function PosterImage({
  src,
  alt,
  className,
  transition = 220,
  contentFit = "cover",
}: PosterImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <View
        className={`items-center justify-center bg-surface-container ${className ?? ""}`}
        accessible
        accessibilityLabel={alt}
      >
        <Icon name="movie" size={28} color={ON_SURFACE_VARIANT} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: src }}
      className={className}
      contentFit={contentFit}
      transition={transition}
      placeholderContentFit="cover"
      // A flat fill rather than a blurhash: the payloads carry no hash, and
      // this is the same `bg-surface-container` the fallback box uses, so a
      // slow poster and a missing one look like the same component.
      placeholder={{ blurhash: undefined }}
      style={{ backgroundColor: POSTER_PLACEHOLDER }}
      onError={() => setFailed(true)}
      accessibilityLabel={alt}
      // Posters are decorative next to the title text that always accompanies
      // them, so they are not announced twice.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
