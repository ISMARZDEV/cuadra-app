// Test stub for heavy icon packages (lucide-react-native ≈1500 modules, react-native-svg).
// Aliased in vitest.config so Vite never scans/pre-bundles the real package (which hangs the
// run). CJS Proxy → any named import (e.g. `{ Plus }`, `{ Svg }`) resolves to a no-op component.
module.exports = new Proxy(
  { __esModule: true, default: () => null },
  { get: () => () => null },
);
