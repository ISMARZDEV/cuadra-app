declare module "react-native-squircle-view" {
  import { ViewProps } from "react-native";

  interface SquircleViewProps extends ViewProps {
    cornerSmoothing?: number;
    cornerRadius?: number;
  }

  export function SquircleView(props: SquircleViewProps): JSX.Element;
}
