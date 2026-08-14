import * as Haptics from "expo-haptics";
import { Image, Linking, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Bookmark, CircleMinus, CirclePlus, Eye, ImageOff, Plus } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { memo, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { PillButton } from "@/components/ui/pill-button";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

/**
 * Lo que la tarjeta necesita para pintarse. Vive ACÁ y no en la feature del chat: el componente
 * subió a `components/ui` al usarlo una segunda pantalla, y un componente compartido que importa
 * tipos de una feature invierte la dependencia — `ui` no puede saber que existe `aispace`.
 * `features/aispace/interfaces.ts` lo reexporta para no romper a quien ya lo importaba de ahí.
 */
export interface ProductListItemData {
  index: number;
  canonical_product_id: string;
  name: string;
  brand?: string | null;
  size?: string | null;
  image_url?: string | null;
  url?: string | null;
  unit_price: string;
}

// Product card inside the basket carousel — mobile adaptation of the web ProductPreviewCard
// (Figma node 708:25970 / 508:14893 / 834:13200). Keeps the scalloped white shell, index badge,
// eye link, DOP · brand · size line, unit price with superscript cents, and the bottom action bar.
//
// Geometría: la tarjeta se diseñó a 164px y TODO lo de adentro está en píxeles fijos. Por eso el
// tamaño no se toca con un número suelto — se toca con `SCALE`, y cada medida interna sale de `s()`.
// Achicar solo el ancho dejaría la imagen, la tipografía y la barra inferior en su tamaño original
// dentro de una cáscara más chica: el contenido reventaría el recorte. Escalar todo junto conserva
// las proporciones que ya están aprobadas visualmente.
//
// CARD_WIDTH se EXPORTA porque los tres carruseles (dock, canasta, resultados por proveedor) lo
// necesitan para `getItemLayout`. Con el número copiado a mano, cambiarlo acá descalibraba el scroll
// de los otros tres en silencio.
const DESIGN_WIDTH = 164;
const SCALE = 0.9;
const s = (n: number) => Math.round(n * SCALE);

export const CARD_WIDTH = s(DESIGN_WIDTH);
const CARD_VB_W = 143.74;
const CARD_VB_H = 250.52;
// El alto NO se fija: el card es FIT. La cáscara SVG se estira (`preserveAspectRatio="none"`) al
// alto que pida el contenido, con la barra incluida. Un `aspectRatio` fijo era el origen de los dos
// defectos reportados: primero el texto de más empujaba la barra FUERA del recorte, y al pinearla
// al fondo de esa caja fija el texto le pasó POR DEBAJO. Con alto fit ninguna de las dos puede
// pasar — la caja se adapta al contenido en vez de que el contenido pelee por la caja. Todos los
// bloques tienen alto fijo, así que las tarjetas de un carrusel siguen midiendo lo mismo.
const CARD_PAD_X = s(10); // padding lateral del contenido
const BAR_H = s(42);
const BAR_GAP = s(5); // aire entre el precio y la barra
// Empujón VERTICAL del contenido de la barra (icono / cantidad). No es capricho: la guirnalda NO es
// simétrica. En el centro, el borde de arriba baja hasta y=7.28 y el de abajo hasta y=38.91 (viewBox
// de 38 de alto) → el centro ÓPTICO de la banda queda ~4 unidades por debajo del centro de la caja.
// Un icono con `justify-center` se centra en la CAJA, no en la banda: por eso se ve alto.
// Referencia para moverlo: 0 = centrado en la caja · 4 = centro óptico exacto de la banda
// (((7.28 + 38.91) / 2 - 38 / 2) * (BAR_H / 38)). Menos = más arriba. El valor final es a ojo.
const BAR_ICON_DY = 3.5;
// Ajuste EXTRA para los ⊖/⊕, que no van al centro sino a los EXTREMOS de la barra. Ahí la banda es
// otra: va de y=0 a y=30.63, o sea su centro óptico cae ~3.7 unidades ARRIBA del centro de la caja,
// justo al revés que en el medio. Por eso con el mismo offset que el número se ven bajos.
// Es RELATIVO a la capa de `BAR_ICON_DY` — negativo = más arriba. Referencia: -7 los deja en el
// centro óptico exacto de su tramo de banda; -4 es medio camino.
const BAR_SIDE_ICON_DY = -5.5;
// Ancho de la barra. Por defecto llena el ancho útil (card menos su padding lateral). Bajalo para
// meterla hacia adentro: `CARD_WIDTH - CARD_PAD_X * 2 - s(12)`, o un número directo.
// OJO: el SVG de la barra se estira con `preserveAspectRatio="none"`, así que angostarla MUCHO
// deforma la guirnalda y deja de correr paralela a la del card.
const BAR_WIDTH = CARD_WIDTH - CARD_PAD_X * 2;
// Hueco bajo la barra. La guirnalda de abajo ocupa el ÚLTIMO 3.9% del alto (9.774 de 250.52 en el
// viewBox) y a los lados sube más que en el centro: con el card rondando los 280px son ~11px de
// curva. Este es el PISO — por debajo de ~s(12) la barra empieza a morder el borde del card.
const BAR_BOTTOM = s(10);
// Alto RESERVADO para el precio tachado, haya oferta o no. Es el `lineHeight` de esa línea: la
// reserva es lo que mantiene las barras de una fila mixta a la misma altura.
const PREV_PRICE_H = s(15);
// El sello de oferta MONTA sobre el canto superior del card en vez de vivir dentro. Este es cuánto
// sobresale: media altura del sello lo dejaría partido justo por el borde, así que sube un poco
// menos y se apoya en el canto.
const DISCOUNT_H = s(30);
// EXPORTADO: quien monte estas tarjetas en una lista tiene que reservar este aire arriba, o el
// contenedor recorta el sello y se ve partido por la mitad. Con el número copiado a mano, tocarlo
// acá dejaría el recorte de vuelta sin que nada avise.
export const CARD_DISCOUNT_OVERHANG = s(10);

// Contorno de la cáscara. Se usa DOS veces —el blanco y el resaltado del toque— así que vive en una
// constante: dos copias del mismo path es garantía de que un día una se actualice y la otra no.
const SHELL_PATH =
  "M16.9141 1H126.829C135.616 1.00008 142.739 8.12295 142.739 16.9102V225.183C142.739 232.573 137.654 238.975 130.489 240.669L130.146 240.746L105.791 245.942C83.4285 250.713 60.3157 250.713 37.9531 245.942L13.5928 240.746C6.24807 239.182 1 232.694 1 225.183V16.9111C1.00364 8.26057 7.90631 1.22262 16.5039 1.00488L16.9141 1Z";

// Rebote de TECLA del card entero. Nada de brillo: se intentó imitar el `isInteractive` del navbar
// (el vidrio nativo de iOS 26 que se ilumina al tocarlo) y no da igual, porque ese brillo es blanco
// y funciona por ser vidrio TRANSLÚCIDO sobre contenido — sobre blanco opaco un brillo blanco no
// existe. El movimiento sí funciona en cualquier superficie.
//
// Baja POCO: 0.96 en una superficie de 148px se lee tan fuerte como 0.86 en un botón chico. El
// carácter de tecla lo da la vuelta, no la bajada — `damping` bajo al salir = overshoot corto.
const CARD_PRESS_SCALE = 0.96;
const CARD_PRESS_IN = { damping: 18, stiffness: 400, mass: 0.7 }; // firme, sin rebote al bajar
const CARD_PRESS_OUT = { damping: 12, stiffness: 260, mass: 0.8 }; // rebota al soltar
// Demora antes de encender el rebote. En 0 A PROPÓSITO: con un delay, empezar a arrastrar para
// scrollear hacía que el card no se moviera nunca —el FlatList se lleva el gesto antes— y el toque
// quedaba mudo. Decisión tomada: TODO toque tiene que verse, aunque termine siendo un scroll. Lo
// que se paga es que al arrastrar el card dippea y vuelve; es la respuesta al dedo, no un error.
// Subilo si ese dip llega a molestar — es el mismo truco de las celdas de lista de iOS.
const CARD_PRESS_DELAY = 0; // ms
// Ventana del TOQUE RÁPIDO. Arrastrar ya está cubierto por el propio Pressable (si el FlatList se
// lleva el gesto, `onPress` nunca se dispara), pero apoyar el dedo y quedarse también termina en un
// `onPress` al soltar — y eso NO es un toque. Con esto, mantener apretado no dispara nada: el card
// rebota y vuelve, sin navegar.
const TAP_MAX_MS = 400;

function formatPriceParts(value: string): { whole: string; cents: string } {
  // value comes formatted by the backend, e.g. "RD$485.00" or "$485.00"
  const numeric = value.replace(/^[^\d]*/, "").replace(/,/g, "");
  const [whole, cents = "00"] = numeric.split(".");
  return { whole: `$${whole}.`, cents };
}

function parseMoneyValue(value: string): number | null {
  const numeric = value.replace(/^[^\d]*/, "").replace(/,/g, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

type UnitType = "unit" | "weight" | "gram" | "volume";

interface ParsedSize {
  amount: number;
  unitType: UnitType;
  baseUnit: string;
  baseAmount: number;
}

function parseSize(size: string | null | undefined): ParsedSize | null {
  if (!size) return null;
  const normalized = size.trim().toLowerCase();

  // Try to extract a leading number; default to 1 when only the unit is present (e.g. "Unidad").
  const amountMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(.+)?$/);
  const amount = amountMatch ? Number(amountMatch[1]) : 1;
  const unitPart = amountMatch?.[2] ?? normalized;

  const unit = unitPart.trim();
  if (!unit || Number.isNaN(amount) || amount <= 0) return null;

  const rules: { units: string[]; unitType: UnitType; baseUnit: string; baseAmount: number }[] = [
    // Presentation-only units: no per-unit price calculation.
    {
      units: [
        "unidad", "und", "unid", "unit", "units", "u",
        "paquete", "paq", "pq", "pack", "packs", "package", "packages",
        "bolsa", "bols", "bag", "bags",
        "caja", "box", "boxes",
        "botella", "bot", "bottle", "bottles",
        "lata", "can", "cans",
        "frasco", "jar", "jars",
        "sobre", "sobres", "sachet", "sachets",
      ],
      unitType: "unit",
      baseUnit: "UND",
      baseAmount: 1,
    },
    // Weight.
    { units: ["lb", "lbs", "libra", "libras", "#"], unitType: "weight", baseUnit: "Lb", baseAmount: 1 },
    { units: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"], unitType: "weight", baseUnit: "Kg", baseAmount: 1 },
    { units: ["oz", "onz", "onza", "onzas", "ounce", "ounces"], unitType: "weight", baseUnit: "Oz", baseAmount: 1 },
    { units: ["gr", "grs", "gramo", "gramos", "gram", "grams"], unitType: "gram", baseUnit: "100 Gr", baseAmount: 100 },
    { units: ["mg", "mgs", "miligramo", "miligramos", "milligram", "milligrams"], unitType: "gram", baseUnit: "Gr", baseAmount: 1000 },
    { units: ["cg", "cgs", "centigramo", "centigramos", "centigram", "centigrams"], unitType: "gram", baseUnit: "Gr", baseAmount: 100 },
    { units: ["dg", "dgs", "decigramo", "decigramos", "decigram", "decigrams"], unitType: "gram", baseUnit: "Gr", baseAmount: 10 },
    // Volume.
    { units: ["ml", "mls", "mililitro", "mililitros", "milliliter", "milliliters"], unitType: "volume", baseUnit: "100 Ml", baseAmount: 100 },
    { units: ["lt", "ltr", "l", "litro", "litros", "liter", "liters"], unitType: "volume", baseUnit: "Lt", baseAmount: 1 },
    { units: ["gal", "galón", "galones", "gallon", "gallons"], unitType: "volume", baseUnit: "Lt", baseAmount: 3.78541 },
    { units: ["fl oz", "fl. oz", "fluid oz", "fluid ounce", "fluid ounces"], unitType: "volume", baseUnit: "100 Ml", baseAmount: 3.3814 },
  ];

  for (const { units, unitType, baseUnit, baseAmount } of rules) {
    if (units.includes(unit)) {
      return { amount, unitType, baseUnit, baseAmount };
    }
  }

  return null;
}

interface UnitLabelParts {
  left?: string;
  x: string;
  right: string;
}

function buildUnitLabelParts(
  unitPrice: string,
  size: string | null | undefined,
): UnitLabelParts {
  const parsedSize = parseSize(size);
  if (!parsedSize || parsedSize.unitType === "unit") {
    const full = t("chat.basket.unitCount");
    const [x, ...rightParts] = full.split(" ");
    return { x: x ?? "X", right: rightParts.length > 0 ? ` ${rightParts.join(" ")}` : "" };
  }

  const price = parseMoneyValue(unitPrice);
  if (price === null) {
    const full = t("chat.basket.unitCount");
    const [x, ...rightParts] = full.split(" ");
    return { x: x ?? "X", right: rightParts.length > 0 ? ` ${rightParts.join(" ")}` : "" };
  }

  const pricePerBase = (price / parsedSize.amount) * parsedSize.baseAmount;
  // Keep the label consistent with the main price, which always renders "$".
  const formatted = `$${pricePerBase.toFixed(2)}`;
  const full = t("chat.basket.pricePerUnit", { price: formatted, unit: parsedSize.baseUnit });
  const parts = full.split(" X ");
  if (parts.length === 2) {
    return { left: `${parts[0]} `, x: "X", right: ` ${parts[1]}` };
  }
  // Fallback: paint the whole thing if the template doesn't contain " X ".
  const [x, ...rightParts] = full.split(" ");
  return { x: x ?? "X", right: rightParts.length > 0 ? ` ${rightParts.join(" ")}` : "" };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Resortes del press. Son los MISMOS números que `components/ui/glass-button.tsx` a propósito: el
// tacto de la app tiene que ser UNO. Un botón que rebota distinto que el de al lado se siente roto
// aunque ninguno de los dos esté mal.
const PRESS_IN = { damping: 18, stiffness: 320, mass: 0.6 };
const PRESS_OUT = { damping: 14, stiffness: 220, mass: 0.7 };
// Rebote del número al cambiar la cantidad: sale rápido y vuelve más blando (overshoot corto).
const POP_OUT = { damping: 14, stiffness: 400, mass: 0.5 };
const POP_BACK = { damping: 14, stiffness: 220, mass: 0.6 };

interface PressFxProps {
  label: string;
  onPress: () => void;
  // `selection` = un valor que cambia de a poco (la cantidad); `impact` = una acción que cierra algo
  // (ver el producto, agregarlo). iOS distingue las dos y usar la equivocada se siente fuera de lugar.
  feedback?: "impact" | "selection";
  role?: "button" | "link";
  style?: ViewStyle;
  // Corrimiento vertical propio. Va ACÁ y no en `style` porque el transform del press (la escala)
  // pisaría cualquier transform que llegue por style — los dos tienen que componerse en el mismo
  // array o uno gana y el otro desaparece.
  dy?: number;
  children: React.ReactNode;
}

// Pressable con escala de resorte + háptica. Local al card porque son sus 4 botones; si un tercer
// componente lo necesita, se promueve a components/ui.
function PressFx({
  label,
  onPress,
  feedback = "impact",
  role = "button",
  style,
  dy = 0,
  children,
}: PressFxProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dy }, { scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      accessibilityRole={role}
      accessibilityLabel={label}
      hitSlop={6}
      onPressIn={() => {
        scale.value = withSpring(0.86, PRESS_IN);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_OUT);
      }}
      onPress={() => {
        // La háptica va ANTES del handler: el dedo tiene que sentir la respuesta en el mismo frame,
        // no después de que el estado (o una navegación) se resuelva.
        if (feedback === "selection") void Haptics.selectionAsync();
        else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

interface BasketProductCardProps {
  item: ProductListItemData;
  currency: string;
  mode?: "basket" | "picker";
  onSelect?: (item: ProductListItemData) => void;
  onView?: (item: ProductListItemData) => void;
  /** Qué número va en el círculo. Por defecto la POSICIÓN (`item.index`), que es lo que significa
   *  en la canasta del chat; la home de Supermarket le pasa en cuántas tiendas está el producto. */
  badge?: number;
  /** Bajada reciente en puntos básicos → el sello rojo «−15». Sin esto no hay sello. */
  discountBps?: number | null;
  /** Lo que costaba antes, ya formateado. Se pinta TACHADO sobre el precio actual.
   *  Ojo: viene de la tienda que bajó y el precio grande es el mínimo entre tiendas, así que los
   *  dos no tienen por qué dar exactamente el porcentaje del sello. */
  previousPrice?: string | null;
  /** Seguir el precio del producto. Cuando llega, el marcador REEMPLAZA al ojo de la esquina. */
  onBookmark?: () => void;
  bookmarked?: boolean;
}

function BasketProductCard({
  item,
  currency,
  mode = "basket",
  onSelect,
  onView,
  badge,
  discountBps,
  previousPrice,
  onBookmark,
  bookmarked = false,
}: BasketProductCardProps) {
  // Local quantity starts at 0: the card is a product picker, not a committed basket line.
  const [quantity, setQuantity] = useState(0);
  const { whole, cents } = formatPriceParts(item.unit_price);
  const unitLabel = buildUnitLabelParts(item.unit_price, item.size);
  const isAdded = quantity > 0;
  // bps → porcentaje entero para el sello. Se descartan el 0 y los negativos: «−0%» no es una
  // oferta, y una SUBIDA de precio no se anuncia con el sello de descuento.
  const discountPercent =
    discountBps != null && discountBps > 0 ? Math.round(discountBps / 100) : null;

  // Rebote de tecla de TODO el card.
  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));
  // Cuándo empezó el toque, para distinguir un tap de un dedo apoyado (ver TAP_MAX_MS).
  const pressStartedAt = useRef<number | null>(null);

  const handleCardPress = () => {
    // `null` = nunca hubo press-in (solo pasa en el harness de tests, donde un `click` sintético no
    // atraviesa el ciclo completo). En el dispositivo el press-in SIEMPRE precede al press.
    const heldFor = pressStartedAt.current === null ? 0 : Date.now() - pressStartedAt.current;
    pressStartedAt.current = null;
    if (heldFor > TAP_MAX_MS) return; // dedo apoyado, no un toque: el rebote ya dio el feedback
    onSelect?.(item);
  };

  // El número rebota al cambiar. Es la confirmación de que el toque entró, sin ocupar espacio ni
  // pedirle nada al usuario.
  const qtyScale = useSharedValue(1);
  const qtyStyle = useAnimatedStyle(() => ({ transform: [{ scale: qtyScale.value }] }));
  const setQuantityWithPop = (next: number) => {
    setQuantity(next);
    qtyScale.value = withSequence(withSpring(1.22, POP_OUT), withSpring(1, POP_BACK));
  };

  return (
    <AnimatedPressable
      style={[{ width: CARD_WIDTH }, cardStyle]}
      // El MODO ya no decide la acción: la decide quien pasa el handler. `mode` manda sobre el
      // CHROME (barra con ojo vs. controles de cantidad), `onSelect` manda sobre el DESTINO —
      // el picker elige el producto, la canasta y los resultados van a Save. Atarlo al modo hacía
      // que agregar un destino nuevo obligara a inventar un modo nuevo.
      onPress={onSelect ? handleCardPress : undefined}
      // Ver CARD_PRESS_DELAY: sin esto, cada intento de scroll del carrusel hace parpadear el card.
      unstable_pressDelay={CARD_PRESS_DELAY}
      onPressIn={() => {
        pressStartedAt.current = Date.now();
        cardScale.value = withSpring(CARD_PRESS_SCALE, CARD_PRESS_IN);
      }}
      onPressOut={() => {
        cardScale.value = withSpring(1, CARD_PRESS_OUT);
      }}
    >
      {/* Scalloped white shell */}
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${CARD_VB_W} ${CARD_VB_H}`}
        preserveAspectRatio="none"
      >
        <Path d={SHELL_PATH} fill="white" stroke="#F4F4F4" strokeWidth={2} />
      </Svg>

      {/* Content */}
      <View
        className="relative z-10 flex flex-col items-center"
        style={{
          paddingHorizontal: CARD_PAD_X,
          paddingTop: s(10),
          paddingBottom: BAR_BOTTOM,
        }}
      >
        {/* Header: index badge + eye link to the store in basket mode */}
        <View className="mb-1 flex w-full flex-row items-center justify-between">
          <View
            className="flex items-center justify-center rounded-full bg-[#CEFFFB]"
            style={{ height: s(26), width: s(26) }}
          >
            <Text
              className="text-[#3BA198]"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: s(17), lineHeight: s(17) }}
            >
              {badge ?? item.index}
            </Text>
          </View>
          {/* El marcador MANDA sobre el ojo: si la pantalla ofrece seguir el precio, ése es el
              gesto de la esquina. Dos acciones en el mismo lugar sería elegir por el usuario. */}
          {onBookmark ? (
            <PressFx label={t("save.product.follow")} onPress={onBookmark}>
              <Icon
                as={Bookmark}
                size={s(24)}
                color="#93D555"
                fill={bookmarked ? "#93D555" : "transparent"}
                strokeWidth={2}
              />
            </PressFx>
          ) : mode === "basket" && item.url ? (
            <PressFx
              role="link"
              label={t("chat.basket.viewProduct")}
              onPress={() => void Linking.openURL(item.url!)}
            >
              <Icon as={Eye} size={s(24)} color="#93D555" strokeWidth={2} />
            </PressFx>
          ) : null}
        </View>

        {/* Product image — vuelve a su alto de diseño: con el card fit ya no hay que robarle
            espacio para que la barra entre. */}
        <View
          className="mb-1 items-center justify-center bg-white px-1 py-1"
          style={{ height: s(110), width: s(110) }}
        >
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          ) : (
            <Icon as={ImageOff} size={s(36)} color="#D1D5DB" />
          )}
        </View>

        {/* Name: reserve two lines so shorter names don’t collapse the price row. */}
        <View className="justify-start px-1" style={{ height: s(30) }}>
          <Text
            className="text-center text-[#131313]"
            style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: s(14), lineHeight: s(12) * 1.2 }}
            numberOfLines={2}
          >
            {item.name}
          </Text>
        </View>

        {/* DOP · brand · size */}
        <View className="mt-1 flex flex-row items-center gap-[5px]">
          <Text
            className="text-[#A6D56E]"
            style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: s(10) }}
          >
            {currency}
          </Text>
          <View className="h-[4px] w-[4px] rounded-full bg-[#B7F0F8]" />
          {item.brand ? (
            <Text
              className="text-[#898989]"
              style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: s(10), maxWidth: s(50) }}
              numberOfLines={1}
            >
              {item.brand}
            </Text>
          ) : null}
          {item.brand && item.size ? (
            <View className="h-[4px] w-[4px] rounded-full bg-[#B7F0F8]" />
          ) : null}
          {item.size ? (
            <Text
              className="text-[#898989]"
              style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: s(10), maxWidth: s(50) }}
              numberOfLines={1}
            >
              {item.size}
            </Text>
          ) : null}
        </View>

        {/* Unit price with superscript cents */}
        <View className="mt-1 flex flex-col items-center">
          {/* Lo que costaba. Va ARRIBA del precio actual y tachado: el ojo compara de arriba hacia
              abajo, y ver primero el número viejo es lo que hace que el nuevo se lea como rebaja.
              El hueco se RESERVA siempre, tenga o no oferta el producto: si sólo apareciera cuando
              hay rebaja, en una fila mixta cada tarjeta terminaría a distinta altura y las barras
              de abajo quedarían escalonadas. Con la reserva, la barra cae siempre en el mismo
              sitio y el precio grande queda alineado entre vecinas. */}
          <View style={{ height: PREV_PRICE_H, justifyContent: "center" }}>
            {previousPrice ? (
              <Text
                className="text-[#A62B2B]"
                style={{
                  fontFamily: KANTUMRUY_SEMIBOLD,
                  fontSize: s(13),
                  lineHeight: s(15),
                  textDecorationLine: "line-through",
                }}
              >
                {previousPrice}
              </Text>
            ) : null}
          </View>
          <View className="flex flex-row items-start justify-center">
            <Text
              className="text-[#034842]"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: s(22), lineHeight: s(22) }}
            >
              {whole}
            </Text>
            <Text
              className="text-[#034842]"
              style={{
                fontFamily: KANTUMRUY_SEMIBOLD,
                fontSize: s(13),
                lineHeight: s(13),
                marginTop: 2,
              }}
            >
              {cents}
            </Text>
          </View>
          <View className="mt-0 flex flex-row items-center justify-center">
            {unitLabel.left ? (
              <Text style={{ fontFamily: KANTUMRUY_MEDIUM, color: "#ADC2C4", fontSize: s(12) }}>
                {unitLabel.left}
              </Text>
            ) : null}
            <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, color: "#00A7BE", fontSize: s(12) }}>
              {unitLabel.x}
            </Text>
            <Text style={{ fontFamily: KANTUMRUY_MEDIUM, color: "#ADC2C4", fontSize: s(12) }}>
              {unitLabel.right}
            </Text>
          </View>
        </View>

        {/* Bottom action bar — basket mode shows quantity controls; picker mode shows the eye
            button. En el FLUJO (no absoluta): con el card fit, la barra es la que define dónde
            termina el card, y el `paddingBottom` de abajo es el hueco de la guirnalda. */}
        {mode === "basket" || mode === "picker" ? (
          <View style={{ width: BAR_WIDTH, height: BAR_H, marginTop: BAR_GAP }}>
            <Svg
              style={StyleSheet.absoluteFill}
              viewBox="0 0 130 38"
              preserveAspectRatio="none"
            >
              <Path
                d="M121.59 30.6347L95.8636 35.257C75.5148 38.9143 54.4813 38.9143 34.1325 35.257L8.40644 30.6347C3.50494 29.7546 0 26.1037 0 21.8791V6.37598C0 2.8555 3.38888 0 7.56696 0L31.115 3.73561C53.5064 7.28543 76.4897 7.28543 98.885 3.73561L122.433 0C126.611 0 130 2.8555 130 6.37598V21.8791C130 26.1037 126.495 29.7513 121.594 30.6347H121.59Z"
                fill={mode === "picker" || isAdded ? "#BBEB71" : "#EAF6D5"}
              />
            </Svg>
            {/* Una sola capa desplazada: el offset vale para el ojo, el "+" y la fila de cantidad. */}
            <View style={{ height: "100%", transform: [{ translateY: BAR_ICON_DY }] }}>
              {mode === "picker" ? (
                <PressFx
                  label={t("chat.basket.viewProduct")}
                  onPress={() => onView?.(item)}
                  style={{ height: "100%", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon as={Eye} size={s(35)} color="#0B6A53" strokeWidth={2} />
                </PressFx>
              ) : isAdded ? (
                <View className="h-full flex-row items-center justify-between px-3">
                  <PressFx
                    label="Disminuir cantidad"
                    feedback="selection"
                    dy={BAR_SIDE_ICON_DY}
                    onPress={() => setQuantityWithPop(Math.max(0, quantity - 1))}
                  >
                    <Icon as={CircleMinus} size={s(22)} color="#0B6A53" strokeWidth={2} />
                  </PressFx>
                  <Animated.Text
                    className="text-[#0B6A53]"
                    style={[{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: s(18) }, qtyStyle]}
                  >
                    {quantity}
                  </Animated.Text>
                  <PressFx
                    label="Aumentar cantidad"
                    feedback="selection"
                    dy={BAR_SIDE_ICON_DY}
                    onPress={() => setQuantityWithPop(quantity + 1)}
                  >
                    <Icon as={CirclePlus} size={s(22)} color="#0B6A53" strokeWidth={2} />
                  </PressFx>
                </View>
              ) : (
                <PressFx
                  label={t("chat.basket.addPlaceholder")}
                  onPress={() => setQuantityWithPop(1)}
                  style={{
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0.6,
                  }}
                >
                  <Icon as={Plus} size={s(26)} color="#55747A" strokeWidth={2} />
                </PressFx>
              )}
            </View>
          </View>
        ) : null}
      </View>

      {/* Sello de descuento — el `PillButton` compartido en su variante `discount`, no una píldora
          dibujada acá: así hereda el canto en degradado y el radio del sistema, y el día que la
          píldora cambie de forma esta cambia con ella.

          Va ÚLTIMO en el árbol para pintarse por encima de todo, y MONTA sobre el canto superior
          del card (`top` negativo). Que sobresalga es el efecto buscado: una etiqueta pegada
          ENCIMA se lee como algo añadido al producto, mientras que dentro del recorte sería un
          elemento más de la composición. El card no recorta, así que el desborde se ve — pero
          quien lo ponga en una lista tiene que reservarle ese aire arriba (`DISCOUNT_OVERHANG`) o
          el contenedor se lo come. */}
      {discountPercent !== null ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: -CARD_DISCOUNT_OVERHANG, alignSelf: "center" }}
        >
          <PillButton
            variant="discount"
            label={`−${discountPercent}`}
            // El texto visible omite el «%» por espacio, pero leído en voz alta «menos 35» no
            // significa nada. La etiqueta accesible lo dice completo.
            accessibilityLabel={`−${discountPercent}%`}
            height={DISCOUNT_H}
            radius={DISCOUNT_H / 2}
            paddingHorizontal={s(10)}
          />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

export default memo(BasketProductCard);

