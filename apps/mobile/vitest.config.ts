import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Test harness: vitest + jsdom + react-native-web (alias) + @testing-library/react.
// RN core ships Flow syntax that esbuild can't transpile, so we DON'T import the native
// `react-native`; we alias it to `react-native-web` (plain TS/JS) and render in jsdom.
// NativeWind `className` is ignored under test (we assert behavior/text, not styles).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // MUST be first: `.svg` file imports become components via react-native-svg-transformer
      // (metro) — that transform doesn't run here, and Vite's default would hand back the URL
      // string (which React then tries to render as a tag → crash). Match the WHOLE id (`.*\.svg$`,
      // not `\.svg$`) so the replacement swaps the entire path for the stub, and place it BEFORE the
      // "@" alias (Vite uses the first matching alias, and "@/..svg" would otherwise match "@" first).
      // Won't catch the "react-native-svg" package — it has no ".svg" (no dot before "svg").
      { find: /.*\.svg$/, replacement: path.resolve(__dirname, "src/test/svg-file-stub.tsx") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "react-native", replacement: "react-native-web" },
      // Heavy icon package → no-op stub (real lucide has ~1500 modules and hangs Vite).
      { find: "lucide-react-native", replacement: path.resolve(__dirname, "src/test/icon-stub.cjs") },
      // react-native-svg → passthrough stub (containers keep their children; native source unparseable).
      { find: "react-native-svg", replacement: path.resolve(__dirname, "src/test/svg-stub.tsx") },
      // expo-haptics → stub: su build web llama a `window.matchMedia` en el import y jsdom no lo
      // tiene, así que el módulo revienta antes de que corra un solo test.
      { find: "expo-haptics", replacement: path.resolve(__dirname, "src/test/haptics-stub.ts") },
      // react-native-safe-area-context → stub: su package.json declara `"react-native":
      // "src/index.tsx"`, así que el resolver agarra el FUENTE TS y su `typeof` de tipos rompe el
      // transform. Lo destapó el primer test de una PANTALLA (los de componentes no montan
      // SafeAreaView).
      {
        find: "react-native-safe-area-context",
        replacement: path.resolve(__dirname, "src/test/safe-area-stub.tsx"),
      },
      // reanimated → stub: its source can't pass vitest's SSR transform and needs Metro-only
      // globals; the stub exposes Animated.* + inert hooks/helpers so components still render.
      { find: "react-native-reanimated", replacement: path.resolve(__dirname, "src/test/reanimated-stub.tsx") },
      // @legendapp/list/keyboard → stub: su build importa react-native-keyboard-controller (nativo)
      // y reanimated por rutas internas. El stub reexporta el LegendList normal, así la lista SIGUE
      // renderizando filas. DEBE ir antes del alias de reanimated y ser más específico que
      // "@legendapp/list" para que sólo capture este subpath.
      {
        find: "@legendapp/list/keyboard",
        replacement: path.resolve(__dirname, "src/test/legend-list-keyboard-stub.tsx"),
      },
      {
        find: "react-native-keyboard-controller",
        replacement: path.resolve(__dirname, "src/test/keyboard-controller-stub.tsx"),
      },
      // react-native-enriched-markdown → stub: `main` re-exporta directo su componente Fabric
      // nativo (código generado, no parseable acá). Ver el propio stub para el porqué del unescape.
      {
        find: "react-native-enriched-markdown",
        replacement: path.resolve(__dirname, "src/test/enriched-markdown-stub.tsx"),
      },
      // skia → stub: the real entry loads a native module (WASM on web) that jsdom can't; the stub
      // renders <Text> as a plain text node so the shimmering status label stays assertable.
      {
        find: "@shopify/react-native-skia",
        replacement: path.resolve(__dirname, "src/test/skia-stub.tsx"),
      },
      // @expo-google-fonts/* → stub: the package `require()`s .ttf assets (Metro-only resolver).
      {
        find: /^@expo-google-fonts\/.*$/,
        replacement: path.resolve(__dirname, "src/test/google-fonts-stub.ts"),
      },
      // Static image `require("@/public/img/x.png")` — Metro's asset resolver (numeric asset ID
      // at build time) doesn't exist under Vite/esbuild here; stub any .png/.jpg/.jpeg import.
      { find: /\.(png|jpe?g)$/, replacement: path.resolve(__dirname, "src/test/image-stub.ts") },
    ],
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".web.jsx", ".web.js", ".jsx", ".js"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    testTimeout: 8000,
    pool: "forks",
  },
});
