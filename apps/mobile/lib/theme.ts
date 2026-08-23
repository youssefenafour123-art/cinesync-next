/**
 * Tokens for the places a `className` cannot reach.
 *
 * NativeWind covers components, but the tab navigator's options, gradient
 * colour arrays, status-bar config and `expo-image` placeholders all want real
 * values in JavaScript. They come from the same `tokens.ts` the Tailwind config
 * reads, so there is still one source of truth.
 */
import { brand, colors, glass, radius } from "@cinesync/shared/tokens";

export { brand, colors, glass, radius };

/** Shorthands for the handful used often enough that the lookup is noise. */
export const PRIMARY = colors.primary;
export const BACKGROUND = colors.background;
export const ON_SURFACE = colors["on-surface"];
export const ON_SURFACE_VARIANT = colors["on-surface-variant"];
export const SURFACE_CONTAINER = colors["surface-container"];
export const OUTLINE_VARIANT = colors["outline-variant"];

/**
 * The scrim under the poster wall, as `expo-linear-gradient` wants it.
 *
 * The web app draws this as two stacked CSS gradients — a vertical fade plus a
 * radial vignette. RN has no radial gradient without pulling in Skia, so the
 * vertical pass is reproduced faithfully and the vignette is dropped; on a
 * phone-width screen the radial term was contributing almost nothing anyway,
 * since its 55% stop sits outside the viewport.
 */
export const WALL_SCRIM = {
  colors: ["rgba(5,5,5,0.55)", "rgba(5,5,5,0.72)", "rgba(5,5,5,0.94)"] as const,
  locations: [0, 0.45, 1] as const,
};

/** Poster overlay used on cards and hero slides, bottom-weighted. */
export const POSTER_SCRIM = {
  colors: ["transparent", "rgba(0,0,0,0.10)", "rgba(0,0,0,0.90)"] as const,
  locations: [0, 0.45, 1] as const,
};

/** A neutral block behind a poster that has not decoded yet. */
export const POSTER_PLACEHOLDER = colors["surface-container"];
