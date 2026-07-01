import { Image, Text, View } from "react-native";

import { ScallopFab } from "@/components/ui/scallop-fab";
import { t, useLang } from "@/i18n";
// ESM import (not require()) — a static-asset require() compiles to a literal Node require() call
// at test runtime, which bypasses Vite's resolve.alias entirely; import goes through Vite's own
// resolution, which DOES honor the alias (and Metro supports both forms for assets).
import illustration from "@/public/img/insights-spaces-empty.png";

import { InsightsCardShell } from "./insights-card-shell";

// Card ② Spaces (insights-ui-navbar.md §3) — EMPTY STATE ONLY this pass, matching both the
// Figma frames (only the empty state was designed) and the backend (basic list/create CRUD only,
// no richer flow yet — docs/sdd/insights-home-mvp.md). Space CREATE is a TODO(insights-mvp)
// no-op — needs cuadra-mobile-forms treatment, out of scope for this first pass.
export function SpacesCard() {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React

  return (
    <InsightsCardShell>
      <View style={{ alignItems: "center", gap: 8 }}>
        <ScallopFab
          label={t("insights.spaces.emptyTitle")}
          size={48}
          onPress={() => {}} // TODO(insights-mvp): Add Space form (cuadra-mobile-forms)
        />
        <Text className="text-accent" style={{ fontSize: 15, fontWeight: "700" }}>
          {t("insights.spaces.emptyTitle")}
        </Text>
        <Text className="text-center text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {t("insights.spaces.emptyDescription")}
        </Text>
        <Image source={illustration} style={{ width: 190, height: 170 }} resizeMode="contain" />
      </View>
    </InsightsCardShell>
  );
}
