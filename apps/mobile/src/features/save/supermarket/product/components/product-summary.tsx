import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { CascadeItem } from "@/components/ui/cascade-item";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import type { HistoryPoint } from "../chart/history-geometry";
import { STEPS as Step } from "../motion/entrance";
import { DEEP_GREEN } from "../product-palette";
import { CuadraInsightBar } from "./cuadra-insight-bar";
import { ProductIdentity } from "./product-identity";
import { ProductPriceBlock } from "./product-price-block";
import { StoreActions } from "./store-actions";

interface Props {
  name: string;
  displaySize?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  priceMinor: number;
  currency: string;
  /** Precio por unidad base de la tienda más barata. `null` si el producto no declara cantidad. */
  unitPriceMinor?: number | null;
  /** «kg», «Oz»… lo que va detrás de la «X». */
  unitLabel?: string | null;
  /** Lo que costaba antes en esa misma tienda. */
  previousMinor?: number | null;
  /** La web de la tienda más barata. */
  storeUrl?: string | null;
  onOpenStore: () => void;
  history?: readonly HistoryPoint[] | null;
  description?: string | null;
  /**
   * El reloj COMPARTIDO de la cascada. No es de esta cabecera: la pantalla pone dos bloques más
   * («Otras tiendas» y el histórico) y tienen que ir en la MISMA escalera. Ver `ProductEntrance`.
   */
  cascade: SharedValue<number>;
  /** El alto que hay que reservarle a la tarjeta de la foto, que se dibuja fuera de este árbol. */
  photoSlot: number;
}

const DESCRIPTION_LINES = 3;

/**
 * La cabecera del detalle: la foto, quién es el producto, cuánto cuesta y qué aporta Cuadra.
 *
 * ⭐ **La composición es el argumento.** Un súper publica una foto y un precio; lo que esta
 * pantalla añade es la DISTANCIA entre dos números —hoy contra antes, por envase contra por
 * unidad— y lo que eso significa. Por eso el precio anterior va AL LADO del de hoy y no escondido
 * abajo, y por eso la franja de Cuadra cierra el bloque: es la firma de lo que sabemos nosotros y
 * el catálogo no.
 *
 * ⭐ **La foto se MONTA sobre el verde del header.** No es un capricho de maquetación: la tarjeta
 * blanca cruzando la curva es lo que dice que el producto va por delante del cromo de la pantalla.
 * Apoyada debajo, el verde se lee como una barra de título y la foto como el primer elemento de
 * una lista cualquiera.
 */
export function ProductSummary({
  name,
  displaySize,
  brand,
  imageUrl,
  priceMinor,
  currency,
  unitPriceMinor,
  unitLabel,
  previousMinor,
  storeUrl,
  onOpenStore,
  history,
  description,
  cascade,
  photoSlot,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View>
      {/* El HUECO de la tarjeta de la foto, que se dibuja FUERA de este árbol.
          Tiene que pasar por delante del header y dentro del scroll eso es imposible —el header es
          hermano del `ScrollView` y gana el z-index—. Ver `HeroPhotoCard`. Sin este espaciador el
          título subiría hasta la cabecera y la tarjeta se le pondría encima. */}
      <View style={{ height: photoSlot }} pointerEvents="none" />

      <View className="px-5 pt-5" style={{ gap: 14 }}>
        <CascadeItem progress={cascade} index={Step.Identity}>
          <ProductIdentity name={name} brand={brand} currency={currency} displaySize={displaySize} />
        </CascadeItem>

        <CascadeItem progress={cascade} index={Step.Price}>
          <ProductPriceBlock
            priceMinor={priceMinor}
            currency={currency}
            unitPriceMinor={unitPriceMinor}
            unitLabel={unitLabel}
            previousMinor={previousMinor}
          />
        </CascadeItem>

        <CascadeItem progress={cascade} index={Step.Actions}>
          <StoreActions url={storeUrl} onOpen={onOpenStore} />
        </CascadeItem>

        <CascadeItem progress={cascade} index={Step.Insight}>
          <CuadraInsightBar
            priceMinor={priceMinor}
            previousMinor={previousMinor}
            currency={currency}
            history={history}
          />
        </CascadeItem>

        {description ? (
          <CascadeItem progress={cascade} index={Step.Description}>
            <View className="border-t border-border pt-4 dark:border-border-dark">
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13, lineHeight: 19 }}
                numberOfLines={expanded ? undefined : DESCRIPTION_LINES}
              >
                {description}
              </Text>
              <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} className="mt-1">
                <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 13, color: DEEP_GREEN }}>
                  {expanded ? t("save.product.readLess") : t("save.product.readMore")}
                </Text>
              </Pressable>
            </View>
          </CascadeItem>
        ) : null}
      </View>
    </View>
  );
}
