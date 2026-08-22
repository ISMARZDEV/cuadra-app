import { Pressable, Text, View } from "react-native";

import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { ACTION, SECTION } from "../product-type";
import type { StoreStanding } from "../product-view";
import { StoreRow } from "./store-row";
import { StoreStats } from "./store-stats";

/** Cuántas filas se ven sin abrir la hoja. Tres es lo que cabe sin empujar el resto fuera de vista
 *  y basta para leer el abanico: la más barata, una del medio y la más cara. */
const PREVIEW_ROWS = 3;

interface Props {
  standings: readonly StoreStanding[];
  onSeeAll: () => void;
  onSelect: (standing: StoreStanding) => void;
}

/**
 * El panel «Otras tiendas»: los cuatro tiles y las primeras filas.
 *
 * Es el gemelo público de «Proveedores matcheados» del admin y lee la MISMA consulta del servidor,
 * así que los dos paneles no pueden dar números distintos.
 */
export function StorePanel({ standings, onSeeAll, onSelect }: Props) {
  if (standings.length === 0) {
    return (
      <View className="px-5 pt-6">
        <Text
          className="text-muted dark:text-muted-dark"
          style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13 }}
        >
          {t("save.product.stores.empty")}
        </Text>
      </View>
    );
  }

  const preview = standings.slice(0, PREVIEW_ROWS);
  const hidden = standings.length - preview.length;

  return (
    <View className="px-5 pt-6" style={{ gap: 12 }}>
      <View className="flex-row items-center justify-between">
        <Text
          className="text-text dark:text-text-dark"
          style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: SECTION }}
        >
          {t("save.product.stores.title")}
        </Text>
        {/* El enlace aparece SIEMPRE que haya más de una tienda, no sólo cuando quedan ocultas: la
            hoja también sirve para elegir entre las que ya se ven. */}
        {standings.length > 1 ? (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: ACTION, color: "#C2410C" }}>
              {t("save.product.stores.seeAll")}
              {hidden > 0 ? ` (+${hidden})` : ""}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <StoreStats standings={standings} />

      <View style={{ gap: 2 }}>
        {preview.map((s) => (
          <StoreRow key={s.row.provider_id} standing={s} onPress={() => onSelect(s)} />
        ))}
      </View>
    </View>
  );
}
