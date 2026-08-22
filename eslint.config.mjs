import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Puppeteer harnesses are standalone CommonJS run by hand with `node`,
    // not part of the app's module graph — Puppeteer isn't even a dependency of
    // this project (see scripts/README.md). Linting them as app source only ever
    // produced `no-require-imports` errors for using the module system they are
    // deliberately written in, which left `npm run lint` failing by default.
    "scripts/**",
  ]),
]);

export default eslintConfig;
