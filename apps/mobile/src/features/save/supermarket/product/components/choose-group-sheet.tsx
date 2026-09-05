import type { ProductGroupDto } from "@cuadra/api-client";
import { Check, Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { LAYER } from "../../layers";
import type { useDeliberateSheet } from "../motion/use-deliberate-sheet";
import { GROUP_NAME_MAX } from "../group-name";

type SheetMotion = ReturnType<typeof useDeliberateSheet>;

interface Props {
  open: boolean;
  sheetStyle: SheetMotion["sheetStyle"];
  veilStyle: SheetMotion["veilStyle"];
  onSheetLayout: SheetMotion["onSheetLayout"];
  groups: readonly ProductGroupDto[];
  loading: boolean;
  /** Entra o sale del grupo. La hoja NO decide cuál de las dos: mira `contains` y avisa. */
  onToggle: (group: ProductGroupDto) => void;
  onCreate: (name: string) => void;
  onRequestClose: () => void;
  /** El nombre ya existe. Lo dice el servidor, que es el único que ve TODOS los grupos. */
  duplicate?: boolean;
  safeBottom: number;
}

/**
 * La hoja «Añadir a grupo»: los grupos del usuario, con palomita en los que ya tienen el producto.
 *
 * ⭐ **Alterna, no sólo añade.** El botón de la fila dice «añadir», pero una hoja que sólo suma
 * obliga a irse a otra pantalla para deshacer lo que se acaba de hacer mal. Tocar una fila marcada
 * la desmarca: el gesto de entrada y el de salida son el mismo.
 *
 * ⭐ **Crear un grupo mete el producto EN EL MISMO GESTO** (lo hace el backend, `CreateProductGroup`).
 * Aquí nadie toca «crear» sin un producto delante — si fueran dos llamadas, un fallo en la segunda
 * dejaría al usuario con una carpeta vacía que no pidió.
 *
 * ⚠️ Comparte el movimiento del `deliberate-return-sheet` con la hoja de tiendas, pero con su PROPIO
 * reloj: las dos nunca están abiertas a la vez y cada una mide su alto, que es lo que fija el viaje.
 */
export function ChooseGroupSheet({
  open,
  groups,
  loading,
  onToggle,
  onCreate,
  onRequestClose,
  duplicate = false,
  safeBottom,
  sheetStyle,
  veilStyle,
  onSheetLayout,
}: Props) {
  const [name, setName] = useState("");
  const limpio = name.trim();

  const crear = () => {
    if (!limpio) return;
    onCreate(limpio);
    // Se vacía en el acto: el nombre ya viajó, y dejarlo escrito invita a tocar «crear» otra vez y
    // chocar contra el duplicado que el propio usuario acaba de crear.
    setName("");
  };

  return (
    <>
      <Animated.View pointerEvents={open ? "auto" : "none"} style={[styles.veil, veilStyle]}>
        <Pressable
          style={styles.fill}
          onPress={onRequestClose}
          accessibilityLabel={t("save.product.groups.close")}
          aria-label={t("save.product.groups.close")}
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
          {t("save.product.groups.title")}
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 24 }}>
            <ActivityIndicator />
          </View>
        ) : groups.length === 0 ? (
          <Text
            className="text-muted dark:text-muted-dark"
            style={{
              fontFamily: KANTUMRUY_MEDIUM,
              fontSize: 13,
              textAlign: "center",
              paddingHorizontal: 24,
              paddingVertical: 16,
            }}
          >
            {t("save.product.groups.empty")}
          </Text>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} onPress={() => onToggle(g)} />
            ))}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: 12, paddingTop: 12, gap: 6 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("save.product.groups.newPlaceholder")}
              placeholderTextColor="#9CA3AF"
              maxLength={GROUP_NAME_MAX}
              returnKeyType="done"
              onSubmitEditing={crear}
              className="flex-1 bg-bg text-text dark:bg-bg-dark dark:text-text-dark"
              style={{
                fontFamily: KANTUMRUY_MEDIUM,
                fontSize: 14,
                height: 44,
                borderRadius: 12,
                borderCurve: "continuous",
                paddingHorizontal: 14,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("save.product.groups.create")}
              aria-label={t("save.product.groups.create")}
              // Sin nombre no hay nada que crear: el botón se apaga en vez de contestar con un error
              // a algo que se puede ver antes de tocarlo.
              disabled={!limpio}
              onPress={crear}
              className="items-center justify-center bg-brand"
              style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", opacity: limpio ? 1 : 0.4 }}
            >
              <Icon as={Plus} size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {duplicate ? (
            <Text style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 12, color: "#C2410C" }}>
              {t("save.product.groups.duplicate")}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </>
  );
}

function GroupRow({ group, onPress }: { group: ProductGroupDto; onPress: () => void }) {
  const cuantos =
    group.product_count === 1
      ? t("save.product.groups.countOne")
      : t("save.product.groups.countOther", { n: String(group.product_count) });

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: group.contains }}
      aria-label={group.name}
      accessibilityLabel={group.name}
      onPress={onPress}
      className="flex-row items-center"
      style={{ gap: 12, paddingVertical: 10, paddingHorizontal: 8 }}
    >
      {/* La palomita a la IZQUIERDA, como una lista de selección de toda la vida: el ojo baja por la
          columna de marcas y ve de un golpe en cuáles está, sin releer los nombres. */}
      <View
        className="items-center justify-center"
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          borderCurve: "continuous",
          borderWidth: group.contains ? 0 : 1.5,
          borderColor: "#D5D9DD",
          backgroundColor: group.contains ? "#0B6A53" : "transparent",
        }}
      >
        {group.contains ? <Icon as={Check} size={15} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          className="text-text dark:text-text-dark"
          style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 15 }}
          numberOfLines={1}
        >
          {group.name}
        </Text>
        <Text
          className="text-muted dark:text-muted-dark"
          style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 12 }}
        >
          {cuantos}
        </Text>
      </View>
    </Pressable>
  );
}

// `StyleSheet.absoluteFillObject` no existe en los tipos de este stack — los cuatro offsets van
// escritos. Ver `cuadra-motion`.
const styles = StyleSheet.create({
  fill: { flex: 1 },
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
