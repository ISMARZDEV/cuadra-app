import type { SvgProps } from "react-native-svg";

import ShellDark from "@/public/brands/shell-dark.svg";
import ShellLight from "@/public/brands/shell-light.svg";
import SpotifyDark from "@/public/brands/spotify-dark.svg";
import SpotifyLight from "@/public/brands/spotify-light.svg";

// A merchant's brand logo as an SVG component pair (dark/light variants live in
// public/brands/). `brandKey` is resolved from the merchant name in accounts-card's
// merchantVisuals(); real transactions with a `merchant.logo_url` bypass this (TxRow renders the
// remote image instead). Add a brand → just drop its two SVGs in public/brands/ and a row here.
export type BrandKey = "spotify" | "shell";

const BRAND_LOGOS: Record<BrandKey, { dark: React.FC<SvgProps>; light: React.FC<SvgProps> }> = {
  spotify: { dark: SpotifyDark, light: SpotifyLight },
  shell: { dark: ShellDark, light: ShellLight },
};

export function MerchantBrandLogo({
  brandKey,
  isDark,
  size,
}: {
  brandKey: BrandKey;
  isDark: boolean;
  size: number;
}) {
  const Logo = isDark ? BRAND_LOGOS[brandKey].dark : BRAND_LOGOS[brandKey].light;
  return <Logo width={size} height={size} />;
}
