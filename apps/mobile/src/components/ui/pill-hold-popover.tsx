import { useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { ArrowEdge, Popover, TriggerType } from "expo-ios-popover";

import { AndroidHoldPopover } from "./android-hold-popover";
import { PILL_LABEL_STYLE, PillButton, type PillVariant } from "./pill-button";
import { useIsTruncated } from "./use-is-truncated";

// Orquestador por PLATAFORMA de "mantener oprimido para ver el texto completo" sobre una píldora
// truncada (docs/chat-sugerencias-vivas.md §popover).
//
// POR QUÉ HAY DOS IMPLEMENTACIONES: `expo-ios-popover` —el módulo de referencia, elegido por el
// usuario— es 100% iOS: su `expo-module.config.json` declara `"platforms": ["apple"]` y no trae
// carpeta `android/` en absoluto (usa `UIPopoverPresentationController` de UIKit, que no tiene
// equivalente en Android). Cuadra sí compila para Android, así que ahí va un camino propio en JS
// (`android-hold-popover.tsx`, calcado de `info-tooltip.tsx`, que ya resolvía este mismo problema
// de escapar el `overflow:hidden` de una tarjeta).
//
// EL RIESGO QUE ESTE DISEÑO EVITA POR CONSTRUCCIÓN: el módulo nativo cuelga su propio
// `UILongPressGestureRecognizer` de UIKit sobre el `Trigger` que lo envuelve
// (`ExpoiOSPopoverModuleView.swift:48-68`), sin `cancelsTouchesInView = false`. React Native no usa
// UIGestureRecognizer por vista — tiene su propio sistema de responder — así que envolver una
// píldora que YA es un `Pressable` (con su propio tap-to-send) dentro de ese `Trigger` podría
// competirle el gesto. Por eso NUNCA conviven dos dueños del gesto sobre el mismo elemento: en iOS
// el long-press vive ENTERO en el módulo nativo y `PillButton` no recibe `onHoldReveal` — en
// Android/web `PillButton` mantiene su `Pressable` de siempre y es la ÚNICA fuente del gesto.
/** Tope de ancho de la PÍLDORA. Por debajo abraza su contenido; acá empieza a envolver. */
const PILL_MAX_WIDTH = 240;

/** El texto envuelve hasta acá dentro de la píldora; recién pasadas estas líneas se corta con `…`
 *  y aparece el gesto para ver el resto. */
const PILL_MAX_LINES = 2;
const PILL_V_PADDING = 11;

// La geometría se DERIVA de las líneas permitidas, y vive acá y no en el llamador a propósito: el
// alto tiene que dar para `PILL_MAX_LINES` exactas. Con dos constantes sueltas en archivos
// distintos, subir el tope de líneas dejaría la píldora corta y el texto recortado por el alto en
// vez de por el `numberOfLines` — un recorte sin `…`, invisible en los tests.
export const PILL_HEIGHT = PILL_LABEL_STYLE.lineHeight * PILL_MAX_LINES + PILL_V_PADDING * 2;
/** Cápsula: el radio NUNCA debe superar la mitad del alto o RN recorta los extremos en elipse. */
export const PILL_RADIUS = PILL_HEIGHT / 2;
const PILL_PADDING_X = 16;

/** Lo que le queda al TEXTO dentro de la píldora. La medición del truncado tiene que envolver
 *  exactamente donde envuelve la píldora real, y ahí el padding ya se comió su parte — medir
 *  contra el ancho total daría una línea de más y el `…` aparecería tarde. */
const PILL_TEXT_WIDTH = PILL_MAX_WIDTH - PILL_PADDING_X * 2;

type PillWithHoldPopoverProps = {
  label: string;
  onPress: (text: string) => void;
  fillOpacity?: number;
};

/** El fondo del bubble del módulo nativo iOS no acepta un degradado (sólo `backgroundColor`
 *  plano) — se usa el tono más oscuro de la paleta `surface`, la misma familia que la píldora. */
const IOS_POPOVER_BG = "#0A0A0C";
const VARIANT: PillVariant = "surface";

/** `none` = el texto entra entero, no hay nada que revelar · `native` = popover de UIKit ·
 *  `js` = el bubble propio (`android-hold-popover.tsx`). */
export type HoldStrategy = "none" | "native" | "js";

/**
 * Qué popover corresponde. Pura y exportada porque bajo jsdom `Platform.OS` es siempre `"web"`:
 * un test sobre el componente NUNCA entra a la rama iOS, así que un guard probado sólo ahí pasaría
 * por la razón equivocada. Acá las cuatro combinaciones se prueban de verdad.
 */
export function resolveHoldStrategy(opts: {
  isTruncated: boolean;
  isIOS: boolean;
  nativeAvailable: boolean;
}): HoldStrategy {
  if (!opts.isTruncated) return "none";
  // Sin el módulo en el BINARIO, `Popover.Trigger` no renderiza la píldora: renderiza el recuadro
  // rojo "Unimplemented component: <ViewManagerAdapter_ExpoiOSPopoverModule>". Pasa al recargar JS
  // nuevo sobre un dev-client viejo (visto en device el 2026-08-09) y pasaría con cualquier binario
  // al que no se le corrió `expo prebuild`. Un carrusel de recuadros rojos es MUCHO peor que no
  // tener popover, así que se degrada al camino JS — que funciona en cualquier binario.
  if (opts.isIOS && opts.nativeAvailable) return "native";
  return "js";
}

// Se resuelve UNA vez por módulo: si el módulo nativo está o no en el binario no cambia en runtime.
const NATIVE_POPOVER_AVAILABLE = requireOptionalNativeModule("ExpoiOSPopoverModule") !== null;

export function PillWithHoldPopover({ label, onPress, fillOpacity = 1 }: PillWithHoldPopoverProps) {
  // El gesto SÓLO se ofrece si el texto de verdad se cortó: un popover que promete revelar algo y
  // muestra lo mismo que ya se ve es peor que no tenerlo. La medición vive aparte porque es
  // inalcanzable bajo jsdom — ver el aviso en `use-is-truncated.tsx`.
  const { isTruncated, shadow } = useIsTruncated(label, PILL_TEXT_WIDTH, PILL_MAX_LINES);
  const strategy = resolveHoldStrategy({
    isTruncated,
    isIOS: Platform.OS === "ios",
    nativeAvailable: NATIVE_POPOVER_AVAILABLE,
  });

  const [androidVisible, setAndroidVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const androidReveal = useRef((rect: { x: number; y: number; width: number; height: number }) => {
    setAnchor(rect);
    setAndroidVisible(true);
  }).current;
  const androidRelease = useRef(() => setAndroidVisible(false)).current;

  const pill = (
    <PillButton
      variant={VARIANT}
      label={label}
      height={PILL_HEIGHT}
      radius={PILL_RADIUS}
      paddingHorizontal={PILL_PADDING_X}
      fillOpacity={fillOpacity}
      maxWidth={PILL_MAX_WIDTH}
      maxLines={PILL_MAX_LINES}
      onPress={() => onPress(label)}
      // SÓLO el camino JS recibe esto — con el popover nativo, el gesto lo gobierna UIKit y dos
      // dueños del mismo gesto competirían (ver el bloque de arriba).
      onHoldReveal={strategy === "js" ? androidReveal : undefined}
      onHoldRelease={strategy === "js" ? androidRelease : undefined}
    />
  );

  if (strategy === "none") {
    return (
      <View>
        {shadow}
        {pill}
      </View>
    );
  }

  if (strategy === "native") {
    return (
      <View>
        {shadow}
        <Popover trigger={TriggerType.LongPress} direction={ArrowEdge.Top}>
          <Popover.Trigger>{pill}</Popover.Trigger>
          <Popover.Content style={{ backgroundColor: IOS_POPOVER_BG }}>
            {/* Mismo estilo que la píldora —centrado incluido—: el popover es la MISMA frase, sin
                recortar. Cambiarle la tipografía la haría leer como otra cosa. */}
            <Text style={{ ...PILL_LABEL_STYLE, color: "#FFFFFF", padding: 12 }}>{label}</Text>
          </Popover.Content>
        </Popover>
      </View>
    );
  }

  return (
    <View>
      {shadow}
      {pill}
      <AndroidHoldPopover visible={androidVisible} anchor={anchor} label={label} />
    </View>
  );
}
