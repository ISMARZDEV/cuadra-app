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
    alias: {
      "@": path.resolve(__dirname, "src"),
      "react-native": "react-native-web",
      // Heavy icon/SVG packages → no-op stub (real lucide has ~1500 modules and hangs Vite).
      "lucide-react-native": path.resolve(__dirname, "src/test/icon-stub.cjs"),
      "react-native-svg": path.resolve(__dirname, "src/test/icon-stub.cjs"),
    },
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
