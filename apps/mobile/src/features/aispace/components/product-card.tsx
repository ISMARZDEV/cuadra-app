import { Image, Text, View } from "react-native";

import { t } from "@/i18n";

import type { ProductCardData } from "../interfaces";

// La comparación de Save, DENTRO de la burbuja del chat. Reemplaza al enlace externo: mandar al
// navegador abandona la conversación, y comparar precios es justo lo que el usuario vino a hacer.
//
// Ni un número se arma acá: los precios llegan ya formateados del backend (§5.5, «el LLM jamás
// calcula un número» — y la UI tampoco). Lo único que pone el cliente es el CHROME localizado:
// «Más barato» y la línea de captura viven en i18n, no en el payload, porque un chat en inglés
// con una etiqueta en español sería el mismo bug que la regla es/en/pt existe para evitar.
export function ProductCard({ data }: { data: ProductCardData }) {
  return (
    <View className="mx-3 my-2 overflow-hidden rounded-2xl border border-text/10 bg-text/5">
      <View className="flex-row items-center gap-3 p-3">
        {data.image_url ? (
          <Image
            source={{ uri: data.image_url }}
            style={{ width: 56, height: 56, borderRadius: 12 }}
            resizeMode="contain"
          />
        ) : null}
        <View className="flex-1">
          <Text className="font-sans-semibold text-base leading-5 text-text" numberOfLines={2}>
            {data.name}
          </Text>
          {data.brand ? <Text className="font-sans text-xs text-text/50">{data.brand}</Text> : null}
        </View>
      </View>

      <View className="px-3 pb-1">
        {data.stores.map((store) => (
          <View
            key={store.provider}
            className="flex-row items-center justify-between border-t border-text/5 py-2"
          >
            <View className="flex-1 flex-row items-center gap-2">
              <Text className="font-sans text-base text-text">{store.provider}</Text>
              {store.is_cheapest ? (
                <Text className="font-sans-semibold rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                  {t("chat.product.cheapest")}
                </Text>
              ) : null}
            </View>
            <Text
              className={
                store.is_cheapest
                  ? "font-sans-semibold text-base text-text"
                  : "font-sans-medium text-base text-text/70"
              }
            >
              {store.price}
            </Text>
          </View>
        ))}
      </View>

      {/* §8.2 — cada precio se cita con CUÁNDO se capturó. Sin esto el usuario no puede detectar
          que el dato está viejo, y el disclaimer de «puede variar en tienda» deja de ser honesto. */}
      {data.captured_at ? (
        <Text className="font-sans px-3 pb-3 pt-1 text-[11px] leading-4 text-text/40">
          {t("chat.product.capturedOn", { date: data.captured_at })}
        </Text>
      ) : null}
    </View>
  );
}
