import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { useDeliberateSheet } from "../motion/use-deliberate-sheet";

import { t } from "@/i18n";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { LAYER } from "../../layers";
import type { StoreStanding } from "../product-view";
import { StoreRow } from "./store-row";

// Los tipos salen del propio hook: si cambia lo que devuelve, esto se entera solo.
type SheetMotion = ReturnType<typeof useDeliberateSheet>;

interface Props {
  open: boolean;
  /** ⭐ Los estilos LLEGAN de fuera. La hoja NO llama al hook: el anfitrión también se mueve con
   *  este movimiento, y dos llamadas serían dos relojes para una sola cosa — el patrón lo dice
   *  expreso («one driver, N derivations»). Hoy coincidirían y se separarían al tocar una duración. */
  sheetStyle: SheetMotion["sheetStyle"];
  veilStyle: SheetMotion["veilStyle"];
  onSheetLayout: SheetMotion["onSheetLayout"];
  standings: readonly StoreStanding[];
  onRequestClose: () => void;
  onSelect: (standing: StoreStanding) => void;
  /** Área segura inferior: la hoja llega al borde y sin esto la última fila queda bajo el indicador. */
  safeBottom: number;
}

/**
 * La hoja «Elegir tienda».
 *
 * El movimiento es el patrón `deliberate-return-sheet` de la librería, MEDIDO sobre el clip de
 * referencia: sube en 150 ms decelerando y tarda 420 ms en devolver la página, acelerando. Casi el
 * triple, y a propósito — ver `motion/sheet-timings.ts`.
 *
 * ⚠️ El anfitrión (la pantalla) NO se desmonta: se atenúa y retrocede. Sustituirlo por una
 * navegación perdería la posición de scroll, y recuperar la página EXACTAMENTE donde se dejó es el
 * argumento entero del regreso lento.
 */
export function ChooseStoreSheet({
  open,
  standings,
  onRequestClose,
  onSelect,
  safeBottom,
  sheetStyle,
  veilStyle,
  onSheetLayout,
}: Props) {
  return (
    <>
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={[styles.veil, veilStyle]}
      >
        <Pressable
          style={styles.fill}
          onPress={onRequestClose}
          accessibilityLabel={t("save.product.stores.close")}
          aria-label={t("save.product.stores.close")}
        />
      </Animated.View>

      <Animated.View
        onLayout={onSheetLayout}
        pointerEvents={open ? "auto" : "none"}
        className="bg-surface dark:bg-surface-dark"
        style={[styles.sheet, sheetStyle, { paddingBottom: safeBottom + 8 }]}
      >
        <View style={styles.handle} />
        <Text
          className="text-text dark:text-text-dark"
          style={{
            fontFamily: KANTUMRUY_SEMIBOLD,
            fontSize: 16,
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          {t("save.product.stores.choose")}
        </Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 4 }}
        >
          {standings.map((s) => (
            <StoreRow
              key={s.row.provider_id}
              standing={s}
              selected={s.standing === "cheapest"}
              onPress={() => onSelect(s)}
            />
          ))}
        </ScrollView>
      </Animated.View>
    </>
  );
}

// `StyleSheet.absoluteFillObject` no existe en los tipos de este stack — los cuatro offsets van
// escritos. Ver `cuadra-motion`.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  // ⚠️ El `zIndex` NO es decorativo, y su ausencia fue un defecto real: sin él el velo pintaba en 0
  // y las cuatro piezas de la página que SÍ llevan el suyo —desenfoque, header, foto y tirador— se
  // quedaban por encima, sin atenuar. Un velo modal va por encima del cromo de la página, siempre.
  // Ver `layers.ts`.
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000",
    zIndex: LAYER.veil,
  },
  sheet: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: LAYER.sheet,
    maxHeight: "82%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D5D9DD",
    marginBottom: 10,
  },
});
