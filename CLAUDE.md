# CineSync — monorepo notes

Three npm workspaces:

| Path | What it is |
| --- | --- |
| `apps/web` | The Next.js 16 app. Unchanged by the mobile port apart from where its types come from. Owns every `/api/*` route handler, which is the only backend either app has. |
| `apps/mobile` | The Expo / React Native app, iOS and Android. Talks to `apps/web`'s route handlers over HTTP; it has no server of its own. |
| `packages/shared` | Types, API contract and design tokens. Imported by both. |

Commands run from the repo root: `npm run dev` / `npm run build` (web), `npm run mobile` (Expo), `npm run check:tokens`. Mobile-specific Expo commands (`npx expo install`, `npx expo export`) run from `apps/mobile`.

## packages/shared contains no React. Keep it that way.

No hooks, no components, no zustand stores — types, pure functions and plain data only.

`apps/web` pins React at exactly `19.2.8` for Next 16 and Expo SDK 57 wants `19.2.3`, so npm hoists one and nests the other. `packages/shared` sits *above* both apps in the tree, so anything it imports resolves from the workspace root — meaning it would get whichever React is hoisted, which is the wrong one for one of the two apps. The symptom is "Invalid hook call" with nothing pointing at the cause.

That is why `useFetch`, `useAppStore` and `useTrailer` exist twice, in `apps/web/lib` and `apps/mobile/lib`, rather than being shared. They diverge anyway — AsyncStorage vs localStorage, router vs a `tab` string, and RN's `fetch` rejecting an abort with a plain `Error` where the browser throws a `DOMException`.

`apps/mobile/metro.config.js` pins React as a second layer of defence. It *resolves* the path rather than hardcoding it, because which way npm hoists is not stable across installs.

## Two Tailwind majors, on purpose

The web is on Tailwind v4. NativeWind 4 — the only stable release — is built against Tailwind v3 and throws `NativeWind only supports Tailwind CSS v3` if it resolves v4. NativeWind 5 is what targets v4, and it is still a preview.

So three copies of Tailwind coexist, and each consumer has to reach a specific one:

| Consumer | Resolves from | Version |
| --- | --- | --- |
| `nativewind`'s Metro plugin | workspace root `node_modules` | **3.4.x** — declared as a root devDependency purely to win the hoist |
| `@import "tailwindcss"` in `apps/web/app/globals.css` | `apps/web/node_modules` | **4.x** — declared as an `apps/web` devDependency |
| `@tailwindcss/postcss`'s engine | its own nested `node_modules` | **4.x** — a hard dependency of that package, npm nests it automatically |

The root `tailwindcss: "^3.4.17"` devDependency looks stray — nothing at the root imports Tailwind. It is there to force the hoist, because NativeWind resolves from the root and there is no other way to control what it finds. Removing it breaks `npm run mobile`; removing `apps/web`'s v4 breaks `npm run build`. Both failures are at build time with confusing messages, so if you touch Tailwind versions, run **both** builds before committing.

## Design tokens

`packages/shared/src/tokens.ts` is the source of truth. `apps/mobile/tailwind.config.js` reads it directly (Node strips the types itself — keep that file to plain data and `as const`, no enums). `apps/web/app/globals.css` declares the same values by hand in its `@theme {}` block, because Tailwind v4 needs literal CSS at the top of the entry and generating it would put a build step in front of `next dev`.

`npm run check:tokens` diffs the two and fails on drift. Run it after changing either.

## The API contract

Response shapes live in `packages/shared/src/payloads.ts`; each route handler imports its own and re-exports it, so the existing `@/app/api/*/route` imports in the web components still work. A handler whose payload drifts from the shared type fails to compile.

The mobile app builds every URL through `endpoints` in `packages/shared/src/api.ts`, which prefixes `EXPO_PUBLIC_API_BASE`. The web passes relative paths and that prefix is empty. Never put a secret behind an `EXPO_PUBLIC_*` variable — those are inlined as plaintext into the app bundle. The TMDB key stays server-side, which is the whole reason mobile talks to `/api/*` rather than to TMDB.

## Mobile: what was deliberately not ported

- **The pointer half of `AmbientBackground`** — proximity lighting, the cursor spotlight, velocity-driven 3D tilt. There is no cursor. `apps/mobile/components/layout/AmbientBackground.tsx` is a new ~200-line component sharing the idea, not a port.
- **The animated conic-gradient poster edge light.** RN has no conic gradient and no mask compositing; a faithful version needs Skia, which is not in Expo Go. Replaced with a static hairline and a top-edge highlight.
- **`TiltCard`**, **carousel arrows**, and every `hover:` state — all mouse-only. Press states and native momentum scroll replace them.
- **TMDB member reviews** in `ScoresPanel`. The aggregate scores, the RT consensus and the named press critics are all there, and kept as carefully apart as on the web.
