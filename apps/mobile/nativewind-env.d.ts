/// <reference types="nativewind/types" />

/**
 * `app/_layout.tsx` imports `../global.css` for its side effect — that import
 * is what tells NativeWind's Metro transformer which stylesheet to compile.
 * TypeScript 6 rejects a side-effect import with no declaration behind it, so
 * this is the declaration.
 */
declare module "*.css" {}
