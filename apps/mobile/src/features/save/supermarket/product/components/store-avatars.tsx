import { Image, Text, View } from "react-native";

import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

/** Cuántos caben antes de que la fila se lea como un amontonamiento. El resto va al «+N». */
const MAX_VISIBLE = 3;
const SIZE = 26;
const OVERLAP = 8;

export interface AvatarStore {
  name: string;
  logoUrl?: string | null;
}

interface Props {
  stores: readonly AvatarStore[];
  label: string;
}

/**
 * Los logotipos de las tiendas que lo venden, superpuestos.
 *
 * ⭐ Se dibujan SIEMPRE los tres primeros, con logo o con inicial. Antes se filtraban los que no
 * tenían logotipo y con un catálogo sin logos cargados la fila quedaba en un «+3» suelto: un
 * contador sin nada que contar, que se lee como un error de carga.
 */
export function StoreAvatars({ stores, label }: Props) {
  const visible = stores.slice(0, MAX_VISIBLE);
  const hidden = stores.length - visible.length;
  if (visible.length === 0) return null;

  return (
    <View className="flex-row items-center" accessibilityLabel={label} accessible>
      {visible.map((store, i) => (
        <View
          key={`${store.name}-${i}`}
          className="items-center justify-center"
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            marginLeft: i === 0 ? 0 : -OVERLAP,
            borderWidth: 1.5,
            borderColor: "#FFFFFF",
            backgroundColor: "#EEF3EE",
            overflow: "hidden",
          }}
        >
          {store.logoUrl ? (
            <Image
              source={{ uri: store.logoUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 11, color: "#0B6A53" }}>
              {store.name.trim().charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      ))}
      {hidden > 0 ? (
        <View
          className="items-center justify-center"
          style={{
            height: SIZE,
            minWidth: SIZE,
            paddingHorizontal: 6,
            borderRadius: SIZE / 2,
            marginLeft: -OVERLAP,
            borderWidth: 1.5,
            borderColor: "#FFFFFF",
            backgroundColor: "#E8F0E9",
          }}
        >
          <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 11, color: "#0B6A53" }}>
            +{hidden}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
