import { CircleMinus, CirclePlus, ShoppingBasket } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { GlassButton } from "@/components/ui/glass-button";
import { GlassSurface } from "@/components/ui/glass-surface";
import { t } from "@/i18n";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

interface Props {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onAdd: () => void;
  /** Área segura inferior. El pie FLOTA, así que además se le suma aire propio. */
  safeBottom: number;
  /** 0 = puesta · 1 = fuera. La misma señal que esconde la barra de tabs, y por eso el mismo viaje. */
  hideProgress: SharedValue<number>;
}

const BAR_HEIGHT = 60;
const BUTTON = 40;
/** Aire bajo la barra. Flota como el navbar de la app, sin pegarse al canto — pero apoyada bien
 *  abajo: es la zona del pulgar, y subirla le roba altura al contenido sin ganar nada. */
const FLOAT_AIR = 2;

/** Lo que el scroll debe reservar para que su última sección no quede bajo la barra flotante. */
export const FOOTER_CLEARANCE = BAR_HEIGHT + FLOAT_AIR * 2;

/**
 * El pie del detalle: un navbar FLOTANTE de vidrio, igual que la barra de tabs de la app.
 *
 * ⭐ Sin fondo sólido y superpuesto al contenido A PROPÓSITO: el vidrio nativo es un efecto de
 * FONDO — sobre una superficie plana no se ve nada. Sólo «lee» como vidrio cuando hay contenido con
 * contraste desplazándose por debajo, y por eso esta barra va absoluta sobre el scroll, no en flujo.
 *
 * ⭐ El `GlassSurface` es un FONDO en `absoluteFill`, nunca el elemento que se dimensiona al
 * contenido: un `GlassView` que envuelve contenido que crece se mide mal en Fabric y la zona entera
 * se despega de donde debería estar clavada. El alto lo fija un hermano de RN normal.
 *
 * ⚠️ Este componente NO puede ir dentro de un ancestro que ESCALE (el retroceso de la hoja): iOS
 * rasteriza el vidrio y estirar ese mapa de bits satura el tinte y granula la textura. Trasladar sí
 * es seguro; escalar no.
 *
 * ⚠️ MOCK — el botón está vivo visualmente pero su destino (la lista de compras) todavía no existe.
 * Ver `product-placeholders.ts`.
 */
export function ProductFooter({
  quantity,
  onQuantityChange,
  onAdd,
  safeBottom,
  hideProgress,
}: Props) {
  // ⭐ SÓLO se traslada, nunca se funde. Es la misma regla que gobierna la barra de tabs: una
  // opacidad animada sobre un ancestro de un `GlassView` lo aísla en su propia capa de composición
  // y ahí ya no hay «detrás» que muestrear — el cristal se apaga y quedan los botones flotando.
  // Además el desvanecido se come el recorrido: la barra desaparece a mitad de camino y nunca se
  // la ve llegar al borde, que es la parte que se lee como fluida.
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hideProgress.value * (BAR_HEIGHT + safeBottom + FLOAT_AIR + 40) }],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          right: 16,
          bottom: safeBottom + FLOAT_AIR,
          left: 16,
        },
        hideStyle,
      ]}
    >
      <View style={{ borderRadius: BAR_HEIGHT / 2, overflow: "visible" }}>
        {/* Fondo de vidrio: absoluteFill, y el borde va en `style` porque el GlassView nativo
            IGNORA el prop `borderWidth` — sólo el borde real de RN se ve en el dispositivo. */}
        <GlassSurface
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: BAR_HEIGHT / 2,
              borderWidth: StyleSheet.hairlineWidth * 1.5,
              borderColor: "rgba(255,255,255,0.35)",
            },
          ]}
        />

        {/* El contenido REAL, hermano del vidrio, es quien fija el alto de la barra. */}
        <View
          className="flex-row items-center justify-between"
          style={{ height: BAR_HEIGHT, paddingHorizontal: 8, gap: 10 }}
        >
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <GlassButton
              icon={CircleMinus}
              label={t("save.product.decrease")}
              size={BUTTON}
              iconSize={20}
              // Suelo en 0, no en 1: la cantidad dice CUÁNTOS has añadido a la lista, y si no has
              // añadido ninguno la respuesta honesta es cero. (Arrancaba en 1 con el argumento de
              // que multiplica un precio; el argumento era bueno para otra cosa —cuánto te cuesta
              // llevarte tres— pero no para el estado inicial de algo que no has tocado.)
              onPress={() => onQuantityChange(Math.max(0, quantity - 1))}
            />
            <Text
              className="text-text dark:text-text-dark"
              style={{
                fontFamily: KANTUMRUY_SEMIBOLD,
                fontSize: 17,
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {quantity}
            </Text>
            <GlassButton
              icon={CirclePlus}
              label={t("save.product.increase")}
              size={BUTTON}
              iconSize={20}
              onPress={() => onQuantityChange(quantity + 1)}
            />
          </View>

          {/* Es el MISMO `GlassButton` que el −/+, en su variante con texto: mismo vidrio, mismo
              gradiente y —lo que se notaba— el mismo muelle al pulsar. Antes era un `Pressable`
              plano y por eso no reaccionaba igual que sus vecinos.

              `accent` lo invierte respecto a ellos: es la única acción de la pantalla, y con el
              mismo verde de los otros dos no se distinguiría de un control de cantidad. */}
          <GlassButton
            icon={ShoppingBasket}
            label={t("save.product.addToList")}
            text={t("save.product.addToList")}
            size={BUTTON}
            iconSize={19}
            accent
            onPress={onAdd}
          />
        </View>
      </View>
    </Animated.View>
  );
}
