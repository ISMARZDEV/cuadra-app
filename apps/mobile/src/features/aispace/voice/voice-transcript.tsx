import { useEffect } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { shimmerGlow, shimmerOpacity } from "./text-shimmer";

/** Tinta del dictado sobre la cúpula: casi negra en claro, casi blanca en oscuro. */
const INK_LIGHT = "#141A17";
const INK_DARK = "#F7FAF7";

const FONT_SIZE = 24;
const LINE_HEIGHT = 32;

/**
 * CUÁNTO SE QUEDA LA FRASE EN PANTALLA antes de irse, con el brillo recorriéndola.
 *
 * ⭐⭐ **Sustituye al viaje de media pantalla, y es un cambio de idea, no de número.** Antes cada
 * letra SUBÍA `0.55 × alto` y se deshacía por su cuenta: con treinta caracteres eso eran treinta
 * cosas viajando a alturas distintas, y no se leía «se envía» sino ruido —letras sueltas
 * desperdigadas—. Ahora la frase no se mueve: se queda quieta, LEGIBLE, mientras el brillo la
 * recorre diciendo que algo trabaja, y después se va entera.
 *
 * ⚠️ **SE EXPORTA, y no es un detalle.** Quien orquesta el ciclo (el orbe) temporiza contra esto.
 * Estuvo duplicado con otro valor —380 contra 900— y la desintegración se cortaba al 52 %: parecía
 * que no hubiera animación ninguna. Un número que dos archivos deben acordar vive en UNO y el otro
 * lo importa (`cuadra-motion` §5).
 */
export const TEXT_HOLD_MS = 2000;
/**
 * CUÁNTAS VECES cruza el brillo durante ese rato.
 *
 * ⭐ El periodo se DERIVA de aquí en vez de escribirse suelto. Así los 2 s son el número que se
 * pidió y la cadencia se ajusta sola: cambiar la espera no descuadra el barrido, que fue justo lo
 * que pasaba cuando cada tiempo vivía por su cuenta.
 */
export const SHIMMER_CYCLES = 3;

/**
 * EL RELOJ DEL BARRIDO — un objeto y no dos números sueltos, para que se pueda AFIRMAR.
 *
 * ⚠️⚠️ **`Easing.linear` no es un descuido: es la regla.** El escalonado vive en la ventana de cada
 * letra (`text-shimmer`), así que una curva aquí aplastaría el desfase real —el que se mide en
 * milisegundos— y las letras del medio se amontonarían. La cascada del detalle de producto se
 * estuvo atropellando una fase entera por esto, con 480 tests en verde, porque el arnés no
 * distinguía una curva de otra. Ahora sí, y hay un test que lo mira. Ver `cuadra-motion` §7a.
 */
export const SHIMMER_TIMING = {
  duration: TEXT_HOLD_MS / SHIMMER_CYCLES,
  easing: Easing.linear,
};

/**
 * EL DESVANECIDO FINAL: la frase se va DE UNA PIEZA.
 *
 * ⭐ Corto a propósito. Es el punto y final —«enviado»—, no un movimiento con contenido propio: lo
 * que había que mirar ya se miró durante los dos segundos anteriores. Alargarlo convertiría un
 * cierre en una espera.
 */
export const TEXT_EXIT_MS = 300;
/** Lo que tarda el brillo en encenderse al entrar en el telón. Una transición, no un interruptor. */
const SHIMMER_FADE_MS = 240;

/**
 * LO DICTADO, SOBRE LA CÚPULA.
 *
 * ⭐ **El texto se escribe MIENTRAS hablas** — llega en parciales del reconocedor; no hay ningún
 * temporizador simulando tecleo.
 *
 * ⭐⭐ **Y se queda QUIETO mientras se envía.** Un texto que viaja no se puede leer, y lo que el
 * usuario quiere justo en ese instante es comprobar que se entendió bien lo que dictó. El brillo que
 * lo recorre dice «estoy en ello» sin moverlo ni un píxel; el desvanecido final dice «ya está».
 *
 * ⭐ **Las palabras NO se parten.** Cada palabra es una caja que envuelve entera, y el barrido va
 * por letra DENTRO de ella. Antes el flujo era de caracteres sueltos y una frase larga partía las
 * palabras a mitad («te f / ue»), que es exactamente lo que hace ilegible un texto centrado.
 */
export function VoiceTranscriptText({
  text,
  visible,
  shimmer,
  isDark,
  onHeightChange,
}: {
  text: string;
  /** `false` dispara la salida: la frase entera se desvanece. */
  visible: boolean;
  /** `true` mientras el agente trabaja: el brillo recorre la frase en bucle. */
  shimmer: boolean;
  isDark: boolean;
  /** Altura real ya envuelta, usada por el menisco para dejarle más espacio al dictado. */
  onHeightChange?: (height: number) => void;
}) {
  const fade = useSharedValue(visible ? 1 : 0);
  /** El reloj del barrido, 0→1 en bucle. Compartido por TODA la frase — ver `text-shimmer`. */
  const cycle = useSharedValue(0);
  /** Cuánto manda el shimmer: 0 mientras se dicta (tinta plena), 1 mientras se envía. */
  const glow = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(visible ? 1 : 0, {
      // Entrar es inmediato —el texto ya está llegando—; salir es el punto final.
      duration: visible ? 160 : TEXT_EXIT_MS,
      // ⭐ **LO QUE SE VA, ACELERA. LO QUE LLEGA, FRENA.** `out` es la curva de aterrizar: recorre
      // casi todo al principio y luego se arrastra. `in` arranca contenido y se dispara al final,
      // que es como se lee algo que se lanza.
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [visible, fade]);

  useEffect(() => {
    glow.value = withTiming(shimmer ? 1 : 0, {
      duration: SHIMMER_FADE_MS,
      easing: Easing.out(Easing.quad),
    });
    if (!shimmer) {
      // ⚠️ Un `withRepeat(-1)` sigue vivo mientras el componente esté montado: apagarlo por opacidad
      // NO lo detiene, sólo hace que su trabajo no se vea. Es la lección que le costó al orbe cuatro
      // paths por fotograma en todas las pantallas.
      cancelAnimation(cycle);
      cycle.value = 0;
      return;
    }
    cycle.value = 0;
    // ⚠️⚠️ **EL RELOJ VA LINEAL, y no es cosmético.** El escalonado vive en la VENTANA de cada letra
    // (`text-shimmer`), así que una curva aquí aplastaría el barrido: las letras del medio se
    // amontonarían y el frente dejaría de leerse como algo que viaja. `cuadra-motion` §7a.
    cycle.value = withRepeat(withTiming(1, SHIMMER_TIMING), -1, false);
    return () => cancelAnimation(cycle);
  }, [shimmer, cycle, glow]);

  // ⚠️ El desvanecido va en el CONTENEDOR y no letra a letra: es UN suceso —la frase se va— y
  // repartirlo entre N hijos lo convertiría en N. De paso es una sola capa compuesta en vez de N.
  const conjunto = useAnimatedStyle(() => ({ opacity: fade.value }));

  const words = text.trim().length ? text.trim().split(/\s+/) : [];
  const total = words.reduce((n, w) => n + [...w].length, 0);

  if (total === 0) return null;

  // Índice GLOBAL de cada letra dentro de la frase: el barrido cruza el texto entero, no cada
  // palabra por su cuenta. Reiniciarlo en cada palabra daría tantos frentes como palabras.
  let offset = 0;

  return (
    <Animated.View
      onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[
        {
          paddingHorizontal: 28,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
        },
        conjunto,
      ]}
    >
      {words.map((word, w) => {
        const start = offset;
        const letters = [...word];
        offset += letters.length;
        return (
          <View key={`${w}-${word}`} style={{ flexDirection: "row" }}>
            {letters.map((ch, k) => (
              <ShimmerChar
                key={`${k}-${ch}`}
                ch={ch}
                index={start + k}
                total={total}
                cycle={cycle}
                glow={glow}
                isDark={isDark}
              />
            ))}
            {/* El espacio va DENTRO de la palabra que lo precede: así, al envolver, nunca queda un
                hueco huérfano abriendo la línea siguiente. No se anima —un espacio no brilla—. */}
            {w < words.length - 1 ? (
              <Text
                style={{
                  fontFamily: KANTUMRUY_SEMIBOLD,
                  fontSize: FONT_SIZE,
                  lineHeight: LINE_HEIGHT,
                  color: isDark ? INK_DARK : INK_LIGHT,
                }}
              >
                {" "}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );
}

/**
 * UNA LETRA CON EL BRILLO ENCIMA.
 *
 * ⭐⭐ **Un solo reloj para toda la frase, y una VENTANA por letra.** No son N animaciones: es una
 * resta por fotograma en el hilo de UI (`cuadra-motion` §7). Con un reloj por carácter, una frase de
 * sesenta letras montaría sesenta animaciones y el barrido iría a tirones justo cuando más se mira.
 *
 * ⭐ **El brillo va por OPACIDAD y no por color.** Sobre esta paleta es equivalente —`#141A17` al
 * 50 % sobre blanco da ≈ `#7E837F`, prácticamente el gris base que usaba la píldora— y evita
 * `interpolateColor`, que además el arnés de pruebas no reproduce. En tema oscuro funciona igual:
 * el texto es claro sobre fondo oscuro, así que atenuar también lo apaga.
 */
function ShimmerChar({
  ch,
  index,
  total,
  cycle,
  glow,
  isDark,
}: {
  ch: string;
  index: number;
  total: number;
  /** El reloj del barrido, 0..1 en bucle. Compartido por toda la frase. */
  cycle: SharedValue<number>;
  /** Cuánto manda el shimmer: 0 = tinta plena mientras se dicta · 1 = barrido en curso. */
  glow: SharedValue<number>;
  isDark: boolean;
}) {
  const letra = useAnimatedStyle(() => {
    const atenuada = shimmerOpacity(shimmerGlow(cycle.value, index, total));
    // Mezcla contra la tinta plena: mientras se dicta el texto NO respira, se lee. El brillo entra
    // y sale con `glow`, así que encenderlo no es un salto de opacidad.
    return { opacity: 1 - glow.value * (1 - atenuada) };
  });

  return (
    <Animated.Text
      style={[
        {
          fontFamily: KANTUMRUY_SEMIBOLD,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          color: isDark ? INK_DARK : INK_LIGHT,
        },
        letra,
      ]}
    >
      {ch}
    </Animated.Text>
  );
}
