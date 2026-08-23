module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `jsxImportSource: nativewind` is what lets a `className` prop exist on
      // a React Native component at all — NativeWind compiles it away into a
      // style object at build time.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
