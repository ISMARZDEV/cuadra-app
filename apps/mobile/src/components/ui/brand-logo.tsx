import { Image, View } from "react-native";

// Cuadra "iM" brand mark — composed from the two Figma logo pieces (the dotted "i" + the "M"),
// green gradient. Scales by `height`; the pieces keep their intrinsic aspect ratio.
const brandI = require("@/public/logos/brand-i.png");
const brandM = require("@/public/logos/brand-m.png");

// Intrinsic sizes from Figma export (px): i = 103×237, M = 310×233.
const I_RATIO = 103 / 237;
const M_RATIO = 310 / 233;

export function BrandLogo({ height = 36 }: { height?: number }) {
  const iW = height * I_RATIO;
  const mW = height * M_RATIO;
  return (
    <View className="flex-row items-end" style={{ height }}>
      <Image source={brandI} resizeMode="contain" style={{ height, width: iW }} />
      <Image source={brandM} resizeMode="contain" style={{ height: height * 0.98, width: mW, marginLeft: height * 0.06 }} />
    </View>
  );
}
