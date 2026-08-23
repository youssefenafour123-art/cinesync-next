/**
 * The canonical definitions live in `packages/shared/src/types.ts` so the Expo
 * app renders the exact same payload shapes this app's route handlers return.
 * This file stays so the ~40 existing `@/lib/types` imports keep working.
 */
export * from "@cinesync/shared/types";
