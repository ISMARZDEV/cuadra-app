import { Image, Text, type ImageSourcePropType } from "react-native";

import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

const PROVIDER_LOGOS: Record<string, ImageSourcePropType> = {
  bravo: require("../../../assets/provider-logos/bravo.png"),
  carrefour: require("../../../assets/provider-logos/carrefour.png"),
  jumbo: require("../../../assets/provider-logos/jumbo.png"),
  "merca-jumbo": require("../../../assets/provider-logos/merca-jumbo.png"),
  nacional: require("../../../assets/provider-logos/nacional.png"),
  pricesmart: require("../../../assets/provider-logos/pricesmart.png"),
  sirena: require("../../../assets/provider-logos/sirena.png"),
};

function getProviderLogo(name: string) {
  return PROVIDER_LOGOS[name.toLowerCase()] ?? null;
}

interface ProviderLogoProps {
  name: string;
}

export function ProviderLogo({ name }: ProviderLogoProps) {
  const source = getProviderLogo(name);

  if (!source) {
    return (
      <Text
        className="text-base text-text"
        style={{ fontFamily: KANTUMRUY_SEMIBOLD }}
      >
        {name}
      </Text>
    );
  }

  return (
    <Image
      source={source}
      accessibilityLabel={name}
      resizeMode="contain"
      style={{ width: 80, height: 24 }}
    />
  );
}
