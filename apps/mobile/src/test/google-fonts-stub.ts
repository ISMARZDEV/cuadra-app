// Test stub for @expo-google-fonts/* — the real package `require()`s .ttf files (Metro turns those
// into numeric asset IDs; Vite has no such resolver) and re-exports an expo-font hook. Callers only
// ever pass these constants along as an opaque font source, so a Proxy handing back a stable number
// for any name is enough, and it keeps expo-font out of jsdom.
export default new Proxy(
  {},
  {
    get: () => 1,
  },
);

export const KantumruyPro_400Regular = 1;
export const KantumruyPro_500Medium = 1;
export const KantumruyPro_600SemiBold = 1;
export const KantumruyPro_700Bold = 1;
