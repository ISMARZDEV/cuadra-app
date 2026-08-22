import type { CategoryRefDto } from "@cuadra/api-client";
import { Text, View } from "react-native";

import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { MOCK_ACCORDION_BODY } from "../product-placeholders";
import { ProductAccordion } from "./product-accordion";

interface DetailsProps {
  brand?: string | null;
  displaySize?: string | null;
  quality?: string | null;
  breadcrumb?: readonly CategoryRefDto[];
}

/**
 * Las tres secciones plegables del diseño.
 *
 * «Detalles» es la única con dato REAL — y por eso es la única que nace abierta: un acordeón que se
 * abre solo promete contenido, y los otros dos todavía no lo tienen.
 *
 * ⚠️ «Idea de preparación» y «Valores nutricionales» son MOCK: su contenido vendrá del vertical de
 * News. Ver `product-placeholders.ts`; el texto de relleno lo dice en voz alta en vez de fingir.
 */
export function ProductSections({ brand, displaySize, quality, breadcrumb }: DetailsProps) {
  const rows: [string, string][] = [];
  if (brand) rows.push([t("save.product.details.brand"), brand]);
  if (displaySize) rows.push([t("save.product.details.size"), displaySize]);
  if (quality) rows.push([t("save.product.details.quality"), quality]);
  // La categoría es la ÚLTIMA miga: la hoja del árbol, que es la que de verdad describe al producto.
  const leaf = breadcrumb?.[breadcrumb.length - 1];
  if (leaf) rows.push([t("save.product.details.category"), leaf.name]);

  return (
    <View className="px-5 pt-4">
      {rows.length > 0 ? (
        <ProductAccordion title={t("save.product.details.title")} initiallyOpen>
          <View className="pb-4" style={{ gap: 8 }}>
            {rows.map(([label, value]) => (
              <View key={label} className="flex-row items-center justify-between">
                <Text
                  className="text-muted dark:text-muted-dark"
                  style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13 }}
                >
                  {label}
                </Text>
                <Text
                  className="text-text dark:text-text-dark"
                  style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 13 }}
                >
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </ProductAccordion>
      ) : null}

      <ProductAccordion title={t("save.product.accordion.cooking")}>
        <MockBody />
      </ProductAccordion>
      <ProductAccordion title={t("save.product.accordion.nutrition")}>
        <MockBody />
      </ProductAccordion>
    </View>
  );
}

/** El relleno DICE que está pendiente. Un cuerpo inventado sería peor que un hueco: en una app cuyo
 *  producto es la confianza, el usuario no puede distinguir un dato falso de uno real. */
function MockBody() {
  return (
    <Text
      className="text-muted dark:text-muted-dark pb-4"
      style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13, lineHeight: 19 }}
    >
      {MOCK_ACCORDION_BODY}
    </Text>
  );
}
