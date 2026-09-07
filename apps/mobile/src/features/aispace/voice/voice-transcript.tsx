import { Text, View } from "react-native";

import { PillButton } from "@/components/ui/pill-button";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM } from "@/theme/fonts";

import SparkDark from "@/assets/chat/icon-spark-dark.svg";
import SparkLight from "@/assets/chat/icon-spark-light.svg";
import { ShimmerText } from "../components/shimmer-text";

/** Tinta del dictado sobre la cúpula: casi negra en claro, casi blanca en oscuro. */
const INK_LIGHT = "#141A17";
const INK_DARK = "#F7FAF7";
/** El shimmer necesita DOS tonos: el apagado y el que lleva la banda que barre. */
const SHIMMER_BASE_LIGHT = "#8A9490";
const SHIMMER_HIGH_LIGHT = "#141A17";
const SHIMMER_BASE_DARK = "#5C6B64";
const SHIMMER_HIGH_DARK = "#F7FAF7";

interface Props {
  /** Lo dictado hasta ahora. Vacío mientras no se ha dicho nada. */
  transcript: string;
  /** True mientras el dedo sigue apoyado y el reconocedor escucha. */
  listening: boolean;
  /** True tras soltar, mientras se resuelve qué hacer con lo dictado. */
  thinking: boolean;
  isDark: boolean;
}

/**
 * LO QUE SE DICTA, SOBRE LA CÚPULA.
 *
 * ⭐ **El texto se escribe MIENTRAS hablas.** Llega del reconocedor en parciales
 * (`use-voice-capture`), así que esto sólo lo pinta: no hay ningún temporizador simulando tecleo.
 * Un «typewriter» de retardo fijo sería inventarse un ritmo que el reconocedor no tiene, y el
 * patrón de referencia lo prohíbe explícitamente.
 *
 * ⭐⭐ **`Thinking…` es un `PillButton`, no una píldora nueva.** Es el mismo control del carrusel de
 * sugerencias, que era justo lo pedido: la forma, el canto en degradado y el material ya están
 * resueltos ahí. Lo único propio es que su etiqueta Y su icono llevan `ShimmerText` —el barrido
 * recorre los dos— para que se lea como una espera viva y no como un cartel.
 *
 * ⚠️ **Sólo aparece si SE TRANSCRIBIÓ algo.** Un «pensando» sin nada que pensar es una promesa
 * falsa: la app no estaría procesando nada.
 */
export function VoiceTranscript({ transcript, listening, thinking, isDark }: Props) {
  const dictado = transcript.trim();

  if (thinking && dictado) {
    return (
      <PillButton
        label={t("aispace.voice.thinking")}
        accessibilityLabel={t("aispace.voice.thinking")}
        // ⭐ EL ICONO DEL BOTÓN DE SUGERENCIAS, que es el que se pidió: el SVG propio por tema
        // (`icon-spark-*`), no la chispa de lucide. Son dos dibujos distintos y mezclarlos daría dos
        // «sugerencias» que no se parecen.
        icon={isDark ? <SparkDark width={16} height={16} /> : <SparkLight width={16} height={16} />}
        // El texto lo pinta el SHIMMER, no el `<Text>` de la píldora. `label` se mantiene porque es
        // lo que anuncia el lector de pantalla: el barrido es decorativo y no puede llevarse eso.
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
    );
  }

  if (!listening || !dictado) return null;

  return (
    <View style={{ paddingHorizontal: 28 }}>
      <Text
        style={{
          fontFamily: KANTUMRUY_MEDIUM,
          fontSize: 20,
          lineHeight: 27,
          textAlign: "center",
          color: isDark ? INK_DARK : INK_LIGHT,
        }}
        // Tres líneas: más y taparía la cúpula entera; menos y una frase normal se cortaría a mitad.
        numberOfLines={3}
      >
        {dictado}
      </Text>
    </View>
  );
}
