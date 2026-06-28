import { NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS } from "react-native";

// Native tab bar — News · Insights · [iM logo / AISpace] · Save · Config.
// Real iOS 26 liquid-glass UITabBar (the native selection capsule lands on the focused tab,
// including the center "iM"). The Siri orb floats above the bar as a root overlay (OrbOverlay in
// app/_layout) — NOT a BottomAccessory, which would force an unwanted native pill around it.
//
// Icons are the real lucide glyphs, rasterized to template PNGs (src/public/tabicons) so iOS tints
// them via iconColor. Colors use DynamicColorIOS so they track the native appearance (dark/light)
// — the same appearance the theme toggle drives via Appearance.setColorScheme (see config-screen).
const brandIM = require("@/public/logos/brand-im.png");

// Lucide icons (template) — iOS applies iconColor.
const ICON_NEWS = require("@/public/tabicons/news.png");
const ICON_INSIGHTS = require("@/public/tabicons/insights.png");
const ICON_SAVE = require("@/public/tabicons/save.png");
const ICON_CONFIG = require("@/public/tabicons/config.png");

// Brand greens, adaptive to dark/light.
const iconColor = {
  default: DynamicColorIOS({ light: "#034842", dark: "#6AC400" }),
  selected: DynamicColorIOS({ light: "#16A34A", dark: "#C2FB7E" }),
};
const labelStyle = {
  default: { color: DynamicColorIOS({ light: "#1F2937", dark: "#C9D3CC" }) },
  selected: { color: DynamicColorIOS({ light: "#034842", dark: "#FFFFFF" }) },
};

// Transparent screen content so the root AppBackground gradient shows through (the equivalent of
// the old custom Tabs' `sceneStyle: transparent` — NativeTabs otherwise paints an opaque system
// background that hides it, which is why the bg looked "all white").
const transparentContent = { backgroundColor: "transparent" } as const;

export default function TabsLayout() {
  return (
    <NativeTabs iconColor={iconColor} labelStyle={labelStyle} badgeBackgroundColor="#FF2828">
      <NativeTabs.Trigger name="index" contentStyle={transparentContent}>
        <NativeTabs.Trigger.Icon src={ICON_NEWS} renderingMode="template" />
        <NativeTabs.Trigger.Label>News</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* No native Badge — it renders an oversized dot with no size control. A small custom dot is
          drawn over this tab by OrbOverlay instead. */}
      <NativeTabs.Trigger name="insights" contentStyle={transparentContent}>
        <NativeTabs.Trigger.Icon src={ICON_INSIGHTS} renderingMode="template" />
        <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* Center "iM" — its own native tab, so it gets the liquid-glass capsule when selected.
          renderingMode="original" keeps the green gradient instead of tinting it. */}
      <NativeTabs.Trigger name="aispace" contentStyle={transparentContent}>
        <NativeTabs.Trigger.Icon src={brandIM} renderingMode="original" />
        <NativeTabs.Trigger.Label hidden>AISpace</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="save" contentStyle={transparentContent}>
        <NativeTabs.Trigger.Icon src={ICON_SAVE} renderingMode="template" />
        <NativeTabs.Trigger.Label>Save</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="config" contentStyle={transparentContent}>
        <NativeTabs.Trigger.Icon src={ICON_CONFIG} renderingMode="template" />
        <NativeTabs.Trigger.Label>Config</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
