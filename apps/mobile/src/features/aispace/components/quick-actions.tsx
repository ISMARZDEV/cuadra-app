import { useEffect, useRef } from "react";
import { FlatList, View } from "react-native";
import { useColorScheme } from "nativewind";

import {
  PILL_HEIGHT,
  PILL_RADIUS,
  PillWithHoldPopover,
} from "@/components/ui/pill-hold-popover";
import { useLang } from "@/i18n";
import { useSuggestionUsageStore } from "@/store/suggestion-usage-store";

import { useLiveSuggestions } from "../use-live-suggestions";
import { ShimmerText } from "./shimmer-text";
import { SuggestionSkeleton } from "./suggestion-skeleton";
import type { QuickActionsProps } from "../interfaces";

// Carrusel de sugerencias del dock: una fila horizontal de píldoras que se envían al chat de un
// toque, sin pasar por el campo de texto.
//
// Este componente ya NO decide qué mostrar ni en qué orden — eso es `use-suggestions.ts` (las 3
// más enviadas primero, el resto barajado). Acá sólo se pinta y se avisa.
//
// La píldora tampoco se dibuja aquí: es `components/ui/pill-button`, el mismo del contador de
// mensajes gratis del input, en su variante `surface` (negro en degradado, letra blanca).
// Reusarlo no es sólo coherencia visual — ese componente resuelve el canto en degradado con un id
// de <Defs> ÚNICO POR INSTANCIA (`useId`), y copiar su markup para ocho píldoras habría hecho
// colisionar los ocho degradados.

// El alto y el radio de la píldora los define `pill-hold-popover` (los DERIVA de cuántas líneas de
// texto permite) y se importan: acá sólo se necesitan para que el esqueleto de carga mida igual
// que las píldoras que reemplaza.
const GAP = 8;
const EDGE_INSET = 12;

// ── LA PERILLA ──────────────────────────────────────────────────────────────────────────────────
// Cuánto deja pasar el fondo negro de la píldora (0 = transparente, 1 = sólido). Es el único
// número que hay que tocar para calibrar cuánto se ve el chat por detrás del carrusel. Sólo afecta
// al relleno: el texto y el canto se quedan a plena opacidad, si no la píldora se vuelve ilegible.
const PILL_FILL_OPACITY = 1;

// Ventana de rechazo tras el primer toque. Enviar es IRREVERSIBLE: sin esto, un doble toque
// nervioso manda el mismo mensaje dos veces.
const DOUBLE_TAP_GUARD_MS = 600;

/**
 * El producto que el catálogo RECONOCIÓ en lo que se está escribiendo, anunciado sobre el carrusel.
 *
 * Las píldoras dicen QUÉ se puede preguntar; esto dice SOBRE QUÉ. Sin este renglón, ver tres
 * sugerencias distintas con el mismo nombre adentro obliga a leerlas para deducir qué entendió el
 * sistema.
 *
 * Lleva el shimmer de BÚSQUEDA —el mismo de la línea de estado del chat— a propósito: es la misma
 * idea, el sistema trabajando sobre eso. Reusa `ShimmerText` tal cual porque acá el objetivo SÍ es
 * texto (a diferencia de las píldoras, que son vistas y por eso necesitaron su propio esqueleto).
 * Va en la fuente del sistema, que es la que ese componente dibuja en Skia.
 *
 * ⚠️ REGLA DEL RELOJ (`shimmer-text.tsx`, aprendida en `orb-sphere.tsx`): `useClock` late mientras
 * el componente esté MONTADO — ocultarlo por opacidad NO lo detiene. Por eso este encabezado se
 * monta sólo cuando hay producto y desaparece del árbol cuando no lo hay; nunca se oculta.
 */
function ResolvedProductHeader({ product }: { product: string }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    // `alignItems` y no `textAlign`: ShimmerText no es un <Text>, es un Canvas de Skia con el ANCHO
    // EXACTO de los glifos (se mide con las métricas de la fuente). Centrar por dentro no tendría
    // dónde repartir espacio — hay que centrar el canvas entero dentro de la fila.
    <View style={{ paddingHorizontal: EDGE_INSET, paddingBottom: 8, alignItems: "center" }}>
      <ShimmerText
        text={product}
        fontSize={15}
        // Semibold: es un TÍTULO, no un renglón de estado. Con el peso del cuerpo se confundía con
        // las píldoras que tiene debajo en vez de encabezarlas.
        fontWeight="600"
        baseColor={isDark ? "#9CA3AF" : "#6B7280"}
        highlightColor={isDark ? "#F3F4F6" : "#111827"}
      />
    </View>
  );
}

export function QuickActions({ onSelect, draft = "" }: QuickActionsProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { items, isResolving, product, reshuffle } = useLiveSuggestions(draft);
  const record = useSuggestionUsageStore((s) => s.record);

  // El bloqueo va en un ref, NO en estado: un `disabled` por estado se aplica en el commit de
  // React, y RN puede entregar dos `onPress` en el mismo frame — el segundo toque llegaría antes
  // de que el re-render deshabilitara nada. El ref latchea de forma síncrona.
  const lockRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Se recibe la CLAVE y el texto: la clave es la identidad que se cuenta (sobrevive al cambio de
  // idioma), el texto es lo que se envía al chat.
  const handleSelect = (key: string, prompt: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    onSelect(prompt);
    // El contador se persiste; el orden se rehace DESPUÉS, para que la recién enviada ya cuente.
    void record(key).then(reshuffle);
    timerRef.current = setTimeout(() => {
      lockRef.current = false;
    }, DOUBLE_TAP_GUARD_MS);
  };

  // El esqueleto REEMPLAZA a la lista, no se superpone: así el Canvas de Skia se DESMONTA al
  // terminar de resolver, que es justo lo que su reloj necesita (ver suggestion-skeleton.tsx).
  if (isResolving) {
    return (
      <View style={{ paddingBottom: 8 }}>
        <SuggestionSkeleton height={PILL_HEIGHT} radius={PILL_RADIUS} />
      </View>
    );
  }

  return (
    <View>
      {product ? <ResolvedProductHeader product={product} /> : null}
      {/* La lista no lleva padding propio — va en contentContainerStyle — para que el contenido
          sangre hasta el borde y la última píldora se vea CORTADA. Ese corte es lo que anuncia que
          hay más; es emergente del ancho natural del contenido, no un ancho parcial calculado a
          mano. Lo recorta el cardClip (radius 48) de la tarjeta del chat. */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        // Que el toque llegue a la píldora en vez de que lo trague el dismiss del teclado. Es toda
        // la gestión de foco necesaria: no llamamos a Keyboard.dismiss() porque alteraría la
        // coreografía de anclaje que chat-screen.tsx calcula alrededor del teclado.
        keyboardShouldPersistTaps="handled"
        data={items}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        contentContainerStyle={{ paddingHorizontal: EDGE_INSET, paddingBottom: 8 }}
        nestedScrollEnabled
        // Sin getItemLayout (los otros carruseles sí lo pasan, pero su CARD_WIDTH es constante y
        // estas píldoras tienen ancho intrínseco) y sin removeClippedSubviews (remontar una píldora
        // re-dispara su onLayout → un frame sin canto; no hay tantos ítems como para justificarlo).
        renderItem={({ item }) => (
          <PillWithHoldPopover
            fillOpacity={PILL_FILL_OPACITY}
            label={item.label}
            onPress={() => handleSelect(item.usageKey, item.label)}
          />
        )}
      />
    </View>
  );
}
