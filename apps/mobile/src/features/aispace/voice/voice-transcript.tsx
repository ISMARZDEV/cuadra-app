import { useEffect } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { PillButton } from "@/components/ui/pill-button";
import { t } from "@/i18n";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import SparkDark from "@/assets/chat/icon-spark-dark.svg";
import SparkLight from "@/assets/chat/icon-spark-light.svg";
import { ShimmerText } from "../components/shimmer-text";
import { charFade, charProgress } from "./magic-dissolve";

/** Tinta del dictado sobre la cúpula: casi negra en claro, casi blanca en oscuro. */
const INK_LIGHT = "#141A17";
const INK_DARK = "#F7FAF7";
/** El shimmer necesita DOS tonos: el apagado y el que lleva la banda que barre. */
const SHIMMER_BASE_LIGHT = "#8A9490";
const SHIMMER_HIGH_LIGHT = "#141A17";
const SHIMMER_BASE_DARK = "#5C6B64";
const SHIMMER_HIGH_DARK = "#F7FAF7";

/** Cuánto SUBE el texto al irse. Lo justo para leerse como que se lo lleva la onda. */
const EXIT_RISE = 44;
/**
 * LA DESINTEGRACIÓN COMPLETA. Larga a propósito: una onda mágica que dura 380 ms no se ve, se
 * intuye — y entonces no vale la pena hacerla.
 *
 * ⚠️⚠️ **SE EXPORTA, y no es un detalle.** Quien desmonta este texto (el orbe) tiene que esperar
 * EXACTAMENTE esto. Estuvo duplicada allí con otro valor —380 contra 900— y el resultado fue que la
 * desintegración se cortaba al 52 % y el texto desaparecía de golpe: parecía que no hubiera
 * animación ninguna. Un número que dos archivos deben acordar vive en UNO y el otro lo importa
 * (`cuadra-motion` §5).
 */
export const TEXT_EXIT_MS = 900;
/**
 * CUÁNTO VIAJA EL TEXTO AL IRSE, como fracción del alto de pantalla.
 *
 * ⭐⭐ **El texto no se desvanece: SE ENVÍA.** Con recorridos cortos (30, luego 72 pt) sólo se leía
 * como que se apagaba en el sitio. Lo que da la lectura correcta es que RECORRA la pantalla hacia
 * arriba, igual que un mensaje saliendo del input hacia la conversación: ése es el puente entre
 * dictar y conversar, y sin él la transición no cuenta nada.
 *
 * En fracción y no en puntos por la razón de siempre: un número fijo ata el viaje a un teléfono
 * (`cuadra-motion`). A 0.55 el texto sale por el techo en cualquier pantalla.
 */
const CHAR_RISE_RATIO = 0.55;
/** La píldora se funde con el telón, no antes: es lo último que queda del estado «pensando». */
const PILL_EXIT_MS = 420;

/**
 * LO DICTADO, SOBRE LA CÚPULA.
 *
 * ⭐ **El texto se escribe MIENTRAS hablas** — llega en parciales del reconocedor; no hay ningún
 * temporizador simulando tecleo.
 *
 * ⭐⭐ **Y SE VA ANTES QUE LA CÚPULA, no con ella.** Sube y se desvanece con su propio reloj
 * (`TEXT_EXIT_MS`), y sólo cuando ha terminado empieza a bajar el telón. Sacarlos a la vez los funde
 * en un único suceso borroso; por separado se lee la CAUSA — se llevaron tu frase, y sólo entonces
 * se retira lo que la sostenía.
 */
export function VoiceTranscriptText({
  text,
  visible,
  isDark,
}: {
  text: string;
  /** `false` dispara la salida: sube y se desvanece. */
  visible: boolean;
  isDark: boolean;
}) {
  const { height } = useWindowDimensions();
  const rise = height * CHAR_RISE_RATIO;
  const show = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    show.value = withTiming(visible ? 1 : 0, {
      // Entrar es inmediato —el texto ya está llegando—; salir va por delante del telón.
      duration: visible ? 160 : TEXT_EXIT_MS,
      // ⭐⭐ **LO QUE SE VA, ACELERA. LO QUE LLEGA, FRENA.**
      //
      // La salida iba con `out(cubic)`, que es la curva de ATERRIZAR: recorre casi todo al
      // principio y después se arrastra. Con la misma duración se percibía LENTA, porque lo lento
      // es la cola, no el total. `in(cubic)` arranca contenido y se dispara al final: se lee como
      // un lanzamiento, que es justo lo que hace un mensaje al enviarse.
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [visible, show]);

  const chars = [...text];

  if (!text.trim()) return null;

  return (
    <View style={{ paddingHorizontal: 28, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
      {chars.map((ch, i) => (
        <MagicChar
          key={`${i}-${ch}`}
          ch={ch}
          index={i}
          total={chars.length}
          clock={show}
          rise={rise}
          isDark={isDark}
        />
      ))}
    </View>
  );
}

/**
 * UNA LETRA SUBIENDO Y DESHACIÉNDOSE.
 *
 * ⭐⭐ **Un solo reloj para toda la frase, y una VENTANA por letra.** No son N animaciones: es una
 * resta por fotograma en el hilo de UI (`cuadra-motion` §7). Con un reloj por carácter, una frase
 * de sesenta letras montaría sesenta animaciones y el barrido iría a tirones justo cuando más se
 * mira.
 *
 * ⚠️ El espacio se dibuja igual —no se salta— porque es lo que sostiene la separación entre
 * palabras mientras las letras de alrededor se van a alturas distintas.
 *
 * ⭐ **Y todo esto termina ANTES de que la cúpula empiece a bajar.** El orbe espera exactamente
 * `TEXT_EXIT_MS` más un respiro antes de soltar el telón: primero se va la frase, después lo que la
 * sostenía. Al revés —o a la vez— se leería como que la pantalla se limpia de golpe.
 */
function MagicChar({
  ch,
  index,
  total,
  clock,
  rise,
  isDark,
}: {
  ch: string;
  index: number;
  total: number;
  /** 1 = puesto · 0 = deshecho. Compartido por toda la frase. */
  clock: SharedValue<number>;
  /** Cuánto recorre hacia arriba, en puntos. Sale del alto de pantalla — ver `CHAR_RISE_RATIO`. */
  rise: number;
  isDark: boolean;
}) {
  const letra = useAnimatedStyle(() => {
    // El reloj llega como «cuánto queda»; la disolución avanza al revés.
    const gone = charProgress(1 - clock.value, index, total);
    return {
      // Se mantiene legible durante el viaje y se apaga al final — ver `charFade`.
      opacity: charFade(gone),
      transform: [
        { translateY: -gone * rise },
        // Encoger mientras sube: una letra que sólo se desvanece se lee como que baja el brillo;
        // encogiendo se lee como que se deshace.
        { scale: 1 - gone * 0.35 },
      ],
    };
  });

  return (
    <View>
      <Animated.Text
        style={[
          {
            fontFamily: KANTUMRUY_SEMIBOLD,
            fontSize: 24,
            lineHeight: 32,
            color: isDark ? INK_DARK : INK_LIGHT,
          },
          letra,
        ]}
      >
        {ch}
      </Animated.Text>
    </View>
  );
}

/**
 * «PENSANDO…» — OCUPA EL SITIO DEL ORBE, no se pone a su lado.
 *
 * ⭐ El orbe se retira y la píldora entra en su lugar: es el mismo control cambiando de estado, no
 * dos elementos disputándose la misma zona. Es lo que se pidió y lo que hace la referencia, donde
 * el micrófono se convierte en la píldora de carga.
 *
 * ⭐⭐ Es el `PillButton` del carrusel de sugerencias con su icono propio (`icon-spark-*`), y el
 * barrido recorre TEXTO E ICONO. `label` se mantiene aunque el shimmer pinte las letras: es lo que
 * anuncia el lector de pantalla, y un barrido decorativo no puede llevarse la accesibilidad.
 */
export function VoiceThinkingPill({ visible, isDark }: { visible: boolean; isDark: boolean }) {
  const show = useSharedValue(0);

  useEffect(() => {
    show.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 220 : PILL_EXIT_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, show]);

  const style = useAnimatedStyle(() => ({
    opacity: show.value,
    // Un pelo de escala al entrar y al salir: aparecer a opacidad seca se lee como un cartel.
    transform: [{ scale: 0.92 + show.value * 0.08 }],
  }));

  return (
    <Animated.View style={style} pointerEvents="none">
      <PillButton
        label={t("aispace.voice.thinking")}
        accessibilityLabel={t("aispace.voice.thinking")}
        icon={isDark ? <SparkDark width={16} height={16} /> : <SparkLight width={16} height={16} />}
        labelNode={
          <ShimmerText
            text={t("aispace.voice.thinking")}
            fontSize={14}
            fontWeight="500"
            baseColor={isDark ? SHIMMER_BASE_DARK : SHIMMER_BASE_LIGHT}
            highlightColor={isDark ? SHIMMER_HIGH_DARK : SHIMMER_HIGH_LIGHT}
          />
        }
      />
    </Animated.View>
  );
}
