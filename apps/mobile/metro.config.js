// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

/*
  Monorepo wiring.

  Metro only watches the project directory by default, so without the first
  line an edit to `packages/shared` would not trigger a reload — and without
  the second, `require("@cinesync/shared/tokens")` would not resolve at all,
  because npm hoists the symlink to the workspace root's node_modules rather
  than the app's.

  `disableHierarchicalLookup` stays off deliberately: several Expo packages
  resolve their own transitive dependencies by walking up the tree, and turning
  it off breaks them in a way that only shows up at runtime.
*/
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/*
  Pin React to whichever copy this app actually resolves.

  `apps/web` pins react at exactly 19.2.8 for Next 16 and Expo SDK 57 wants
  19.2.3, so npm nests one of them and hoists the other — and which way round
  that lands changes between installs. Metro's own resolution walks up from
  each file, so a package resolving React from above `apps/mobile` could pick
  up the web's copy, and the app would die on "Invalid hook call" with nothing
  pointing at the cause.

  Resolved rather than hardcoded, precisely because the hoisting is not stable:
  `require.resolve` from this directory answers the same question Metro is
  about to ask, wherever npm happened to put the package this week.

  `packages/shared` is kept free of React for the same reason — it sits above
  this directory, so it could only ever resolve the wrong copy.
*/
function resolveFromApp(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [projectRoot] }));
}

config.resolver.extraNodeModules = {
  react: resolveFromApp("react"),
  "react-dom": resolveFromApp("react-dom"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
