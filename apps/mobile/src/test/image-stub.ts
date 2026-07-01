// Stub for static image imports (`require("@/public/img/....png")`) under vitest — Metro's asset
// resolver turns these into a numeric asset ID at build time; Vite/esbuild here has no such
// resolver. The actual image content never matters for behavior/text assertions (same philosophy
// as the other native-dep stubs in this file's siblings), so this just needs to be a value
// react-native-web's <Image source={...}/> accepts without crashing.
export default { uri: "test-stub-image" };
