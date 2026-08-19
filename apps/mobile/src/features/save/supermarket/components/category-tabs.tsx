import { Pressable, ScrollView, Text } from "react-native";

import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

// Las pestañas de categoría del «ver más». Viajan DENTRO del header verde, así que sus colores son
// los de sobre-verde: lima para la activa, blanco apagado para el resto.
//
// Son texto y no píldoras: con fondo de píldora, seis categorías llenan la fila y el usuario deja de
// ver que hay más a la derecha. El peso de la letra y el color ya distinguen la activa.
const ACTIVE = "#C2FB7E";
const IDLE = "rgba(255,255,255,0.55)";

export interface TabItem {
  /** `deals` / `featured` para las listas transversales, o el slug de una categoría del árbol. */
  slug: string;
  name: string;
}

interface CategoryTabsProps {
  tabs: TabItem[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  /** Sangría lateral. La misma que la rejilla, para que la primera pestaña y la primera tarjeta
   *  arranquen en la misma vertical. */
  gutter: number;
}

export function CategoryTabs({ tabs, activeSlug, onSelect, gutter }: CategoryTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // La fila llega al CANTO de la pantalla y sangra por dentro: si el padre la padeara, la última
      // pestaña terminaría antes del borde y se leería como que ahí se acaban las categorías.
      contentContainerStyle={{ paddingHorizontal: gutter, gap: 20, paddingVertical: 14 }}
    >
      {tabs.map((tab) => {
        const active = tab.slug === activeSlug;
        return (
          <Pressable
            key={tab.slug}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.name}
            onPress={() => onSelect(tab.slug)}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: active ? KANTUMRUY_SEMIBOLD : KANTUMRUY_MEDIUM,
                fontSize: 17,
                color: active ? ACTIVE : IDLE,
              }}
            >
              {tab.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
