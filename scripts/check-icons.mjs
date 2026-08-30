/**
 * Fails when a Material Symbols glyph is rendered but not in the subset.
 *
 * `apps/web/lib/icons.ts` names the icons Google is asked to serve, and an
 * icon outside that list has no glyph — the ligature never forms and the raw
 * word "account_circle" appears where the icon should be. That is invisible
 * in review and obvious in production, so it is checked here instead.
 *
 * The scan is deliberately wider than `<Icon name="…">`: half the call sites
 * pass the name through a prop or a data table (`{ id: "sync", icon: "sync" }`,
 * `removeIcon="delete"`, `icon = "search_off"` as a default), so every string
 * literal assigned to an icon-shaped key counts too. Over-collecting is safe —
 * a name that is not really an icon just gets checked and found in the list or
 * reported — while under-collecting is the failure this exists to prevent.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const declared = new Set(
  [...readFileSync(join(web, "lib", "icons.ts"), "utf8").matchAll(/^\s*"([a-z0-9_]+)",$/gm)].map(
    (m) => m[1],
  ),
);
if (declared.size === 0) {
  console.error("check:icons — could not read ICON_NAMES from apps/web/lib/icons.ts");
  process.exit(1);
}

// `name=` only inside an <Icon …> tag; every other pattern is icon-specific
// enough on its own. Tags span lines, so the source is matched unsplit.
const PATTERNS = [
  /<Icon\b[^>]*?\bname=\{?\s*"([a-z0-9_]+)"/gs,
  /<Icon\b[^>]*?\?\s*"([a-z0-9_]+)"\s*:\s*"([a-z0-9_]+)"/gs,
  /\bicon\s*[:=]\s*\{?\s*"([a-z0-9_]+)"/g,
  /\bremoveIcon\s*[:=]\s*\{?\s*"([a-z0-9_]+)"/g,
  /\bicon\s*=\s*"([a-z0-9_]+)"/g,
];

const used = new Map();
for (const file of [...walk(join(web, "components")), ...walk(join(web, "app")), ...walk(join(web, "store"))]) {
  const src = readFileSync(file, "utf8");
  for (const re of PATTERNS) {
    for (const m of src.matchAll(re)) {
      for (const name of m.slice(1).filter(Boolean)) {
        if (!used.has(name)) used.set(name, file.slice(root.length + 1));
      }
    }
  }
}

const missing = [...used].filter(([name]) => !declared.has(name));
if (missing.length) {
  console.error("check:icons — rendered but missing from apps/web/lib/icons.ts:\n");
  for (const [name, file] of missing) console.error(`  ${name}  (${file})`);
  console.error("\nAdd them to ICON_NAMES, keeping the list sorted, or they render as raw text.");
  process.exit(1);
}

const unused = [...declared].filter((n) => !used.has(n));
console.log(
  `check:icons — ${used.size} icons rendered, all present in the subset` +
    (unused.length ? ` (${unused.length} listed but unused: ${unused.join(", ")})` : ""),
);
