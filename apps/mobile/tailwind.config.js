/**
 * NativeWind's Tailwind config.
 *
 * The web app is on Tailwind v4, which declares its theme in CSS (`@theme {}`
 * in `apps/web/app/globals.css`). NativeWind 4 is built against Tailwind v3,
 * which declares it here in JavaScript. The two cannot share one declaration,
 * so both read `packages/shared/src/tokens.ts` instead — this file at build
 * time, and the CSS by hand with `npm run check:tokens` diffing them.
 *
 * The `require` of a `.ts` file works because Node strips the types itself
 * (22.18+ / 24 do this without a flag), which is also the floor Expo SDK 57
 * sets. Everything in `tokens.ts` is plain data and `as const` for exactly this
 * reason — add an enum or a decorator there and this stops loading.
 */
const {
  brand,
  colors,
  radius,
  spacing,
  type,
  lineHeightFor,
  trackingFor,
} = require("../../packages/shared/src/tokens.ts");

/**
 * Tailwind v3 wants `fontSize` as `[size, {lineHeight, letterSpacing}]`, all in
 * strings it can emit as CSS. NativeWind parses those back into numbers for
 * React Native, so `px` here becomes density-independent pixels on the device.
 */
const fontSize = Object.fromEntries(
  Object.entries(type).map(([name, t]) => [
    name,
    [
      `${t.size}px`,
      {
        lineHeight: `${lineHeightFor(name)}px`,
        letterSpacing: `${trackingFor(name)}px`,
        fontWeight: t.weight,
      },
    ],
  ]),
);

const toPx = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, `${v}px`]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ...colors,
        imdb: brand.imdb,
        "background-elevated": brand.backgroundElevated,
      },
      fontSize,
      // Font *families* rather than the per-token families the web config has:
      // on the web every token pointed at one of two faces anyway, and RN picks
      // a weight by naming a different loaded face, not by `fontWeight`.
      fontFamily: {
        display: ["Outfit_600SemiBold"],
        "display-bold": ["Outfit_700Bold"],
        body: ["Inter_400Regular"],
        "body-medium": ["Inter_500Medium"],
        "body-semibold": ["Inter_600SemiBold"],
      },
      borderRadius: {
        DEFAULT: `${radius.DEFAULT}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
        poster: `${radius.poster}px`,
      },
      spacing: toPx(spacing),
      maxWidth: { "container-max": `${spacing["container-max"]}px` },
    },
  },
  plugins: [],
};
