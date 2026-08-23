#!/usr/bin/env node
/**
 * Fails if the web and mobile design tokens have drifted apart.
 *
 * There are two declarations of the same palette and type scale, and there has
 * to be. The web is on Tailwind v4, which reads its theme from CSS (`@theme {}`
 * in `apps/web/app/globals.css`); NativeWind 4 is built against Tailwind v3,
 * which reads it from a JavaScript object. Neither can consume the other's
 * format, and moving the web to a generated stylesheet would put a build step
 * in front of `next dev` for a file that changes twice a year.
 *
 * So instead: `packages/shared/src/tokens.ts` is the source of truth, the CSS
 * is maintained by hand, and this script is what makes that safe. Duplication a
 * machine checks on every build is not really duplication.
 *
 * Run with `npm run check:tokens`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = resolve(root, "apps/web/app/globals.css");

const { colors, type, radius, spacing } = await import(
  // A file URL, because a bare Windows path is not a valid ESM specifier.
  new URL("../packages/shared/src/tokens.ts", import.meta.url).href
);

const css = readFileSync(cssPath, "utf8");

const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
if (!themeBlock) {
  console.error(`✗ No @theme {} block found in ${cssPath}`);
  process.exit(1);
}

/** Every `--name: value;` declaration in the block, comments stripped. */
const declared = new Map();
for (const [, name, value] of themeBlock[1]
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
  declared.set(name, value.trim());
}

const problems = [];

function compare(cssName, expected, label) {
  const actual = declared.get(cssName);
  if (actual === undefined) {
    problems.push(`${label}: --${cssName} is missing from globals.css (tokens.ts has ${expected})`);
  } else if (actual.toLowerCase() !== String(expected).toLowerCase()) {
    problems.push(`${label}: --${cssName} is ${actual} in globals.css but ${expected} in tokens.ts`);
  }
}

for (const [name, value] of Object.entries(colors)) {
  compare(`color-${name}`, value, "colour");
}

for (const [name, t] of Object.entries(type)) {
  compare(`text-${name}`, `${t.size}px`, "type");
  compare(`text-${name}--line-height`, String(t.leading), "type");
  compare(`text-${name}--font-weight`, t.weight, "type");
  // Only the tokens that actually set tracking declare the property.
  if (t.tracking !== 0) compare(`text-${name}--letter-spacing`, `${t.tracking}em`, "type");
}

for (const [name, value] of Object.entries(radius)) {
  // `poster` is a mobile-only alias for the 14px the web writes inline as
  // `rounded-[14px]`, so it has no custom property to compare against.
  if (name === "poster") continue;
  compare(`radius-${name}`, `${value / 16}rem`, "radius");
}

for (const [name, value] of Object.entries(spacing)) {
  compare(`spacing-${name}`, `${value}px`, "spacing");
}

/* Colours declared in the CSS that tokens.ts has never heard of. Not fatal on
   its own — the mobile app may simply not use one yet — but it is how a token
   added to the web quietly fails to reach the phone, so it is worth printing. */
const unknown = [...declared.keys()]
  .filter((n) => n.startsWith("color-"))
  .map((n) => n.slice("color-".length))
  .filter((n) => !(n in colors));

if (problems.length) {
  console.error(`✗ ${problems.length} token mismatch${problems.length === 1 ? "" : "es"}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nUpdate packages/shared/src/tokens.ts and apps/web/app/globals.css together.",
  );
  process.exit(1);
}

if (unknown.length) {
  console.warn(`⚠ In globals.css but not tokens.ts, so unavailable on mobile: ${unknown.join(", ")}`);
}

console.log(
  `✓ ${declared.size} declarations checked — colours, type scale, radii and spacing all match.`,
);
