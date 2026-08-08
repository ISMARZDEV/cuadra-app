declare module "react-native-squircle-view" {
  import { Component } from "react";
  import { ViewProps } from "react-native";

  interface SquircleViewProps extends ViewProps {
    cornerSmoothing?: number;
    cornerRadius?: number;
  }

  // DEFAULT, no nombrado. `index.js` del paquete hace `export default class SquircleView`.
  // Esta declaración decía `export function SquircleView` (nombrado): TypeScript bendecía
  // `import { SquircleView }`, que en runtime llega UNDEFINED y revienta con
  // "Cannot read property 'displayName' of undefined". No se notó porque el único uso vivía en
  // la rama de fallback de `glass-surface.tsx` (Android / iOS <26), que en iOS 26 no se ejecuta.
  export default class SquircleView extends Component<SquircleViewProps> {}
}
