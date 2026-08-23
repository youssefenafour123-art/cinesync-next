/**
 * CineSync design tokens — the single source of truth for both apps.
 *
 * The web app declares these in `apps/web/app/globals.css` under Tailwind v4's
 * `@theme {}`; the Expo app feeds them to Tailwind v3 through
 * `apps/mobile/tailwind.config.js`. Tailwind v4 can only read tokens from CSS
 * and NativeWind 4 can only read them from a JS config, so the two files can't
 * literally share one declaration — `npm run check:tokens` diffs this file
 * against the CSS block instead, and fails if they drift apart.
 *
 * Keep every value a plain literal. This module is imported by a Tailwind
 * config, which is loaded by Metro's Node process, so it must stay free of
 * runtime dependencies.
 */

/** Material-style token set. Names match the CSS custom properties verbatim. */
export const colors = {
  primary: "#4edea3",
  "primary-hover": "#34d399",
  "primary-fixed": "#6ffbbe",
  "primary-fixed-dim": "#4edea3",
  "primary-container": "#10b981",
  "on-primary": "#003824",
  "on-primary-fixed": "#002113",
  "on-primary-fixed-variant": "#005236",
  "on-primary-container": "#00422b",
  "inverse-primary": "#006c49",

  secondary: "#adc6ff",
  "secondary-fixed": "#d8e2ff",
  "secondary-fixed-dim": "#adc6ff",
  "secondary-container": "#0566d9",
  "on-secondary": "#002e6a",
  "on-secondary-fixed": "#001a42",
  "on-secondary-fixed-variant": "#004395",
  "on-secondary-container": "#e6ecff",

  tertiary: "#ffb3af",
  "tertiary-fixed": "#ffdad7",
  "tertiary-fixed-dim": "#ffb3af",
  "tertiary-container": "#fc7c78",
  "on-tertiary": "#650911",
  "on-tertiary-fixed": "#410005",
  "on-tertiary-fixed-variant": "#842225",
  "on-tertiary-container": "#711419",

  error: "#ffb4ab",
  "error-container": "#93000a",
  "on-error": "#690005",
  "on-error-container": "#ffdad6",

  background: "#050505",
  "on-background": "#e1e3e4",

  surface: "#121212",
  "surface-dim": "#111415",
  "surface-bright": "#373a3b",
  "surface-variant": "#323536",
  "surface-tint": "#4edea3",
  "surface-container-lowest": "#0c0f10",
  "surface-container-low": "#191c1d",
  "surface-container": "#1d2021",
  "surface-container-high": "#282a2b",
  "surface-container-highest": "#323536",
  "on-surface": "#e1e3e4",
  "on-surface-variant": "#bbcabf",
  "inverse-surface": "#e1e3e4",
  "inverse-on-surface": "#2e3132",

  outline: "#86948a",
  "outline-variant": "#3c4a42",
} as const;

/**
 * Colours that live outside the token set because they belong to someone else
 * or to one specific effect. They were hardcoded across the web components;
 * naming them here stops the port from guessing at them.
 */
export const brand = {
  /** IMDb's own yellow — star chips, IMDb source tiles, IMDb deep links. */
  imdb: "#f5c518",
  /** Background when OLED "pure black" mode is off. */
  backgroundElevated: "#0f1112",
  /** The three blurred aurora orbs behind everything. */
  aurora: ["#4facfe", "#f093fb", "#5EE7DF"] as const,
} as const;

/**
 * Type scale. Sizes are unitless numbers because React Native's `fontSize`
 * takes density-independent pixels, and `lineHeight` is absolute there rather
 * than a multiplier — `lineHeightFor()` below does that conversion.
 */
export const type = {
  "display-lg": { size: 64, leading: 1.1, tracking: -0.02, weight: "700" },
  "display-md": { size: 48, leading: 1.2, tracking: -0.01, weight: "600" },
  "display-md-mobile": { size: 28, leading: 1.2, tracking: -0.01, weight: "700" },
  "headline-lg": { size: 32, leading: 1.3, tracking: 0, weight: "600" },
  "headline-lg-mobile": { size: 24, leading: 1.3, tracking: 0, weight: "600" },
  "title-lg": { size: 20, leading: 1.5, tracking: 0, weight: "600" },
  "body-lg": { size: 18, leading: 1.6, tracking: 0, weight: "400" },
  "body-md": { size: 16, leading: 1.6, tracking: 0, weight: "400" },
  "label-md": { size: 14, leading: 1.2, tracking: 0.05, weight: "500" },
} as const;

export type TypeToken = keyof typeof type;

/** Absolute line height in dp, which is what RN's `lineHeight` expects. */
export function lineHeightFor(token: TypeToken): number {
  return Math.round(type[token].size * type[token].leading);
}

/**
 * Letter spacing in dp. The CSS values are `em`, so they scale with the size.
 * Rounded to two places because the raw product is a binary-float artefact —
 * `14 * 0.05` is 0.7000000000000001, which would land in the generated config.
 */
export function trackingFor(token: TypeToken): number {
  return Math.round(type[token].size * type[token].tracking * 100) / 100;
}

/** The legacy config overrode Tailwind's defaults, so these are not the usual scale. */
export const radius = {
  DEFAULT: 16,
  lg: 32,
  xl: 48,
  /** Posters and carousel items, which predate the token set. */
  poster: 14,
} as const;

export const spacing = {
  "container-max": 1440,
  gutter: 24,
  "margin-desktop": 64,
  "margin-mobile": 20,
  unit: 8,
} as const;

/**
 * Font families. The web loads these through `next/font/google`; the Expo app
 * loads the same faces through `expo-font`, so the keys have to line up with
 * the `@expo-google-fonts` export names.
 */
export const fonts = {
  /** Display and headline. */
  display: { family: "Outfit", weights: [600, 700] },
  /** Everything else. */
  body: { family: "Inter", weights: [400, 500, 600] },
} as const;

/** `.glass-panel` / `.glass-card`, unpacked so RN can rebuild them by hand. */
export const glass = {
  panel: {
    background: "rgba(18,18,18,0.7)",
    border: "rgba(255,255,255,0.08)",
    blur: 20,
    shadow: "rgba(0,0,0,0.5)",
  },
  card: {
    background: "rgba(29,32,33,0.6)",
    border: "rgba(255,255,255,0.06)",
    blur: 12,
  },
} as const;
