import type { LucideIcon } from "lucide-react-native";
import { memo, useId, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bookmark, Heart, Info } from "lucide-react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM } from "@/theme/fonts";

import { useMyAlerts, useSubscribeAlert, useUnsubscribeAlert } from "../../../api";
import type { HeaderSkin } from "../../header-palette";
import { followedAlertId } from "../follow-state";

/** El disco entero. El mismo tamaño que los botones de la cabecera, un punto más generoso. */
const DISC = 62;
const GLYPH = 26;
/**
 * El aire entre el disco y su etiqueta.
 *
 * ⚠️ El Figma dice `gap: 5px` y en pantalla se leía PEGADO: a 62 pt de disco, cinco puntos no son
 * un aire, son el remate del círculo. El número del diseño venía de un disco más pequeño.
 *
 * ⚠️⚠️ **Va como `marginTop` de la etiqueta y NO como `gap` de la columna.** El `gap` sólo existe
 * entre HERMANOS, y aquí el botón y la etiqueta cuelgan de padres distintos. Medido en su día: con
 * `gap: 5` y con `gap: 10` el aire era exactamente el mismo, 2.3 pt —el interlineado del texto y
 * nada más—. No había hueco: había un número escrito donde nadie lo leía.
 *
 * ⭐ Y el número que se escribe no es el que se ve: una línea reserva sitio por encima de las
 * mayúsculas, así que la tinta empieza ~2.3 pt más abajo que su caja. A 16 quedan ~18 pt de aire
 * real (medido), que es la proporción del mock.
 */
const GAP = 5;
/** La maquetación de UNA columna. Vive en el `View` envolvente, que es quien manda. */
const COLUMN = { alignItems: "center", paddingHorizontal: 8 } as const;

interface Props {
  /** La carta de ESTA llegada, ya resuelta para el tema. De ella salen los dos colores del disco. */
  skin: HeaderSkin;
  /**
   * El canónico. `undefined` mientras viaja la comparación — el detalle resuelve por slug y el id
   * sólo se conoce después. Hasta entonces los botones se dibujan apagados y no aceptan toques, en
   * vez de desaparecer: un control que aparece a los 200 ms mueve la fila justo cuando el usuario
   * está leyendo el precio.
   */
  productId?: string;
  /** Lleva al usuario a las secciones plegables de abajo. */
  onMoreInfo: () => void;
  /**
   * Abre la hoja de grupos. **Opcional a propósito**: mientras los grupos no existan de verdad, la
   * pantalla no pasa nada y el botón se dibuja apagado. Es preferible a un botón vivo que promete
   * guardar y no guarda — y a un `TODO` en el código, que no lo ve nadie corriendo la app.
   */
  onAddToGroup?: () => void;
  /** Si este producto ya está en algún grupo. */
  inGroup?: boolean;
}

/**
 * Las tres acciones sobre el producto, bajo la franja de Cuadra: saber más, guardarlo y vigilarlo.
 *
 * ⭐ **Los tres colores salen de la CARTA de la llegada, no de la paleta de marca.** Es lo que pidió
 * el usuario —«cambiarán según cambian los otros botones que están arriba»— y lo que hace que la
 * pantalla se lea como una sola pieza: la cabecera, sus botones de vidrio y esta fila comparten el
 * tono del día. Con el verde clavado, esta fila sería lo único que no se enteró de que la cabecera
 * cambió de color.
 *
 * ⭐⭐ **Y son EL MISMO botón que los de la cabecera, no una copia parecida.** Reusan `GlassButton`
 * con la misma piel (`skin.button`): vidrio tintado en claro, sólido en oscuro —donde el vidrio se
 * traga cualquier color claro—, su degradado de profundidad y su muelle al tocar. Un disco propio
 * dibujado a mano se parecía hoy y se habría separado al primer retoque del botón de arriba.
 *
 * ⭐ **El estado lo lleva el RELLENO del glifo, no el color del disco** (`iconFilled`). Es lo que
 * hace el mock: el marcador y el corazón se rellenan al activarse y el disco no se mueve. Un disco
 * que cambia de color al tocarlo compite con la carta —parecería que la pantalla repartió otra— y
 * obliga a mantener un segundo par de colores por cada estado.
 */
export function ProductActions({
  skin,
  productId,
  onMoreInfo,
  onAddToGroup,
  inGroup = false,
}: Props) {
  // ⚠️⚠️ **Disco SÓLIDO propio, y NO `GlassButton`.** Se intentó reusar el botón de la cabecera y hay
  // dos razones para no hacerlo, en este orden:
  //
  // 1. **El vidrio sólo luce cuando tiene algo DEBAJO que refractar.** Los botones de arriba se
  //    apoyan sobre la carta de color; esta fila se apoya sobre el fondo LISO de la página, y ahí el
  //    material se queda sin trabajo: los discos salían blanquecinos con el glifo casi invisible.
  // 2. Y para darle a ese componente lo que esta fila necesita —glifo RELLENO al activarse y estado
  //    apagado— había que añadirle props, es decir, tocar el botón del que depende TODA la app por
  //    una pantalla. No sale a cuenta.
  //
  // Lo que sí se copia es la RECETA: relleno con la tinta de la carta, glifo con su fondo, sin aro y
  // con el mismo muelle al tocar. Se parece porque comparte las reglas, no porque comparta el código.
  const tint = skin.button?.tint ?? skin.ink;
  const glyph = skin.button?.icon ?? skin.bg;

  const { data: alerts } = useMyAlerts();
  const subscribe = useSubscribeAlert();
  const unsubscribe = useUnsubscribeAlert();

  const alertId = followedAlertId(alerts, productId);
  const following = alertId !== null;
  // Mientras la mutación viaja, el segundo toque se IGNORA en el handler — pero el botón NO se
  // apaga.
  //
  // ⚠️⚠️ Apagarlo era la causa del parpadeo que reportó el usuario («al pulsar se muestra
  // desaparecido o blanco»): `busy` se pone a `true` en el MISMO gesto que el toque, así que el
  // disco cambiaba de opacidad mientras el muelle lo estaba escalando. Y peor: al deshabilitarse un
  // `Pressable` a mitad de pulsación, RN deja de seguir el gesto y **`onPressOut` no llega nunca**,
  // así que el muelle se quedaba encogido esperando una vuelta que nadie iba a pedir. El estado de
  // «viajando» no es asunto del aspecto del botón; es una guarda del handler.
  const busy = subscribe.isPending || unsubscribe.isPending;

  const toggleFollow = () => {
    if (!productId || busy) return;
    if (alertId) {
      unsubscribe.mutate(alertId);
      return;
    }
    // Sin umbral: «avísame cuando baje», no «avísame si baja de X». El umbral existe en el backend
    // y es una decisión de producto aparte — pedirlo aquí convertiría un toque en un formulario.
    subscribe.mutate({ productId, thresholdMinor: null });
  };

  // ⚠️⚠️ **El ancho de columna se MIDE, no se reparte con `flex`.** Con `flex: 1` —y después con
  // `flexGrow: 1` + `flexBasis: 0`— las tres columnas siguieron saliendo del ancho de su TEXTO:
  // discos a 41.7 / 130 / 207.3 pt en vez de los 80 / 201 / 322 de tercios iguales, con la fila
  // entera escorada a la izquierda. Medido en el simulador recortando el PNG, no supuesto.
  //
  // Midiendo la fila y dividiendo a mano, el reparto no depende de cómo resuelva Yoga un `flex`
  // dentro de un `Pressable` con `style` como función. Es una resta y una división: no puede
  // sorprender. Hasta que llega el primer `onLayout` no hay ancho, y ahí las columnas caen a
  // `flexGrow` — un fotograma, y siempre el mismo que ya se estaba dibujando.
  const [rowWidth, setRowWidth] = useState(0);
  const columnWidth = rowWidth > 0 ? rowWidth / 3 : undefined;

  return (
    <View
      className="flex-row items-stretch"
      style={{ width: "100%" }}
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
    >
      <Action
        icon={Info}
        label={t("save.product.actions.moreInfo")}
        onPress={onMoreInfo}
        width={columnWidth}
        tint={tint}
        glyph={glyph}
      />
      <Action
        icon={Bookmark}
        label={t("save.product.actions.group")}
        a11yLabel={inGroup ? t("save.product.actions.groupOn") : t("save.product.actions.group")}
        selected={inGroup}
        disabled={!productId || !onAddToGroup}
        onPress={onAddToGroup ?? (() => {})}
        width={columnWidth}
        tint={tint}
        glyph={glyph}
      />
      <Action
        icon={Heart}
        label={t("save.product.actions.followPrices")}
        // ⭐ La etiqueta VISIBLE no cambia con el estado —es el mock: dice qué hace el botón, no en
        // qué estado está— pero la de accesibilidad SÍ. Con lector de pantalla, el relleno del
        // corazón no existe: si el nombre tampoco cambiara, seguir y dejar de seguir sonarían igual.
        a11yLabel={following ? t("save.product.follow.on") : t("save.product.follow.off")}
        selected={following}
        disabled={!productId}
        onPress={toggleFollow}
        width={columnWidth}
        tint={tint}
        glyph={glyph}
      />
    </View>
  );
}

function Action({
  icon,
  label,
  a11yLabel,
  selected = false,
  disabled = false,
  onPress,
  width,
  tint,
  glyph,
}: {
  icon: LucideIcon;
  label: string;
  a11yLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** El tercio medido. `undefined` sólo en el primer render, antes del `onLayout`. */
  width?: number;
  /** El relleno del disco: la tinta de la carta. */
  tint: string;
  /** El glifo: el fondo de la carta, para que el botón se lea como un hueco recortado en ella. */
  glyph: string;
}) {
  // El muelle del toque, igual que el del botón de la cabecera. Va en un `Animated.View` —estilo de
  // OBJETO— y no en el `style` función del `Pressable`, que en este árbol no se aplica.
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    // ⚠️⚠️ **El ancho va en este `View` envolvente.** El reparto en tercios se MIDE (`onLayout`
    // arriba) porque `flex` no lo dio: con `flex: 1` —y después con `flexGrow` + `flexBasis: 0`— las
    // tres columnas salían del ancho de su TEXTO y la fila quedaba escorada a la izquierda. Medido
    // recortando el PNG del simulador, no supuesto.
    <View
      style={
        // El tercio medido manda; `flexGrow` es sólo la red del primer fotograma, antes del
        // `onLayout`.
        width != null ? { width, ...COLUMN } : { flexGrow: 1, flexBasis: 0, ...COLUMN }
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        aria-label={a11yLabel ?? label}
        accessibilityLabel={a11yLabel ?? label}
        disabled={disabled}
        // ⚠️ La atenuación del apagado va AQUÍ y no en el `Animated.View` de dentro: allí convive
        // con el `transform` del muelle, y mezclar en el mismo estilo una propiedad que cambia por
        // render con otra que conduce Reanimated es pedirle al hilo de UI que dos dueños escriban
        // la misma vista.
        style={disabled ? { opacity: 0.45 } : undefined}
        onPress={onPress}
        onPressIn={() => {
          if (disabled) return;
          press.value = withSpring(0.86, { damping: 15, stiffness: 320, mass: 0.6 });
        }}
        onPressOut={() => {
          press.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
        }}
      >
        <Animated.View
          style={[
            {
              // ⚠️ Redondo de verdad, SIN squircle: el suavizado de esquinas es para rectángulos. En
              // un círculo no hay esquina que suavizar y sólo añadiría una vista nativa.
              width: DISC,
              height: DISC,
              borderRadius: DISC / 2,
              backgroundColor: tint,
              alignItems: "center",
              justifyContent: "center",
            },
            anim,
          ]}
        >
          <DepthGradient color={lighten(tint, 0.2)} size={DISC} />

          {/* ⭐ El estado lo lleva el RELLENO del glifo, no el color del disco. Un disco que cambia
              de color al activarse compite con la carta —parecería que la pantalla repartió otra— y
              obliga a mantener un segundo par de colores por cada estado. */}
          <Icon
            as={icon}
            size={GLYPH}
            color={glyph}
            strokeWidth={2}
            fill={selected ? glyph : undefined}
          />
        </Animated.View>
      </Pressable>

      <Text
        className="text-muted dark:text-muted-dark"
        style={{
          fontFamily: KANTUMRUY_MEDIUM,
          fontSize: 12,
          textAlign: "center",
          marginTop: GAP,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}


/**
 * El brillo del canto, copiado del botón de la cabecera (`glass-button.tsx`).
 *
 * ⭐ **De abajo a arriba**: el borde denso va en el CANTO INFERIOR, así el disco se lee como una
 * superficie curvada que recoge el rebote de la luz por debajo. Al revés —denso arriba— se lee como
 * una tapa iluminada de frente y con los tintes claros de las cartas ensucia la parte alta.
 *
 * Se dibuja ya REDONDO para que el disco no necesite `overflow: hidden`, que bajo un `scale` no
 * sigue a la transformación y deja asomar las esquinas cuadradas.
 */
const DepthGradient = memo(function DepthGradient({
  color,
  size,
}: {
  color: string;
  size: number;
}) {
  // Un id por instancia: tres `<Defs>` con el mismo id en el mismo árbol y las tres piezas cogen el
  // primero que encuentren.
  const gid = `actionGrad-${useId()}`;
  return (
    <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.5" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} rx={size / 2} ry={size / 2} fill={`url(#${gid})`} />
    </Svg>
  );
});

/**
 * Un paso hacia el blanco. El brillo SIEMPRE aclara el relleno: pasarle el tinte tal cual pintaría
 * una sombra donde va una luz.
 *
 * ⚠️ Está duplicado de `glass-button.tsx`, donde es privado. Se copian cuatro líneas a propósito
 * antes que exportar y acoplar esta pantalla al botón del que depende toda la app.
 */
function lighten(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (255 - v) * amount),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
