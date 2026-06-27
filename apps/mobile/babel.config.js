module.exports = function (api) {
  api.cache(true);
  return {
    // jsxImportSource: nativewind enables className on RN elements.
    // The Reanimated/worklets plugin is auto-added by babel-preset-expo (SDK 54+);
    // do NOT add react-native-worklets/plugin manually → "Duplicate plugin/preset".
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
