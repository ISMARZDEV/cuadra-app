import { useCallback, useState, type ReactNode } from "react";
import { Text, type LayoutChangeEvent } from "react-native";

import { PILL_LABEL_STYLE } from "./pill-button";

/**
 * ¿El texto necesita MÁS líneas de las permitidas?
 *
 * Se compara ALTO, no ancho: con el ancho ya restringido el texto envuelve solo, así que "cuánto
 * mide de alto" es exactamente "cuántas líneas ocupa".
 *
 * La tolerancia de media línea no es un margen de seguridad al azar: el alto medido nunca cae
 * exactamente en `lineHeight × n` (redondeo sub-pixel, métricas de la fuente), y sin ella un texto
 * de 2 líneas justas se declararía truncado por medio punto de diferencia.
 */
export function exceedsLines(
  naturalHeight: number | null,
  lineHeight: number,
  maxLines: number,
): boolean {
  if (naturalHeight === null) return false;
  return naturalHeight > lineHeight * (maxLines + 0.5);
}

/**
 * Mide si un texto, envuelto a `maxWidth`, pasa de `maxLines` líneas.
 *
 * Devuelve `shadow`: una copia del texto con el MISMO estilo y el MISMO ancho, pero SIN tope de
 * líneas y fuera de pantalla — se la deja crecer libre justamente para poder preguntarle cuánto
 * mediría sin recortar. Quien llama debe montarlo (es invisible y no ocupa espacio). Un hook no
 * puede devolver JSX solo, de ahí el par `{ isTruncated, shadow }`.
 *
 * ⚠️ ESTO NO FUNCIONA BAJO JSDOM, Y NO ES UN DESCUIDO DEL HARNESS. `onLayout` de react-native-web
 * se resuelve por `UIManager.measure`, que lee `node.offsetWidth`/`offsetHeight`
 * (`UIManager/index.js:17-19`) — no `getBoundingClientRect`, que es lo único que
 * `src/test/setup.ts` falsea. En jsdom esas propiedades son SIEMPRE 0. Por eso bajo test este hook
 * siempre reporta `isTruncated: false`, y los componentes que dependen de él MOCKEAN este módulo
 * en vez de fingir que miden. La medición real: sólo simulador/device.
 */
export function useIsTruncated(
  label: string,
  maxWidth: number,
  maxLines: number,
): { isTruncated: boolean; shadow: ReactNode } {
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setNaturalHeight(e.nativeEvent.layout.height);
  }, []);

  const shadow = (
    <Text
      // FUERA del árbol de accesibilidad, y no es un detalle: sin esto la etiqueta existe DOS veces
      // (la píldora y esta copia), y un lector de pantalla la leería repetida. `aria-hidden` lo
      // resuelve en las tres plataformas — react-native-web lo reenvía al DOM tal cual, y en
      // nativo RN lo mapea a `accessibilityElementsHidden`/`importantForAccessibility`.
      aria-hidden
      accessible={false}
      style={{
        position: "absolute",
        opacity: 0,
        left: -9999,
        // `width` FIJO, no `maxWidth`: se necesita que envuelva exactamente donde envuelve la
        // píldora real. Y sin `numberOfLines`, para que crezca todo lo que pida.
        width: maxWidth,
        ...PILL_LABEL_STYLE,
      }}
      onLayout={onLayout}
    >
      {label}
    </Text>
  );

  return {
    isTruncated: exceedsLines(naturalHeight, PILL_LABEL_STYLE.lineHeight, maxLines),
    shadow,
  };
}
