import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ArrowUp, Mic, Plus } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  ZoomIn,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";



import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { PillButton } from "@/components/ui/pill-button";
import { t, useLang } from "@/i18n";
import { sounds } from "@/lib/sounds";
import { CHAT_BODY, CHAT_FONT_SIZE, CHAT_LINE_HEIGHT } from "../chat-typography";

// Dos artes distintos, uno por tema: el icono trae sus colores DENTRO del SVG, así que no se
// recolorea con una prop — se elige el archivo.
import SparkDark from "../../../assets/chat/icon-spark-dark.svg";
import SparkLight from "../../../assets/chat/icon-spark-light.svg";
import type { ChatInputBarProps } from "../interfaces";

// ── Medidas (Figma 675:16699 / 675:16918 / 675:17356) ─────────────────────────
// El marco de Figma mide 372pt de ancho. Los anchos absolutos de ahí (323 la fila, 225 el grupo
// izquierdo, 70.16 el derecho) NO son medidas de diseño: son el resultado de ese marco. En un
// teléfono real (390–430pt) hay que dejarlos fluir, así que la fila usa space-between y cada grupo
// abraza su contenido. Lo que SÍ se copia literal son alturas, radios, paddings y tamaños.
const FIELD_RADIUS = 23;
// Figma da 15.648 para el placeholder; se sube un punto a pedido explícito — se lee mejor en
// pantalla real que en el lienzo. La línea acompaña para que el campo siga creciendo por múltiplos.
// Lo que se ESCRIBE tiene que medir igual que lo que se LEE: el composer toma el mismo cuerpo que
// los mensajes (chat-typography) en vez de traer su propio 17/21. El placeholder hereda del campo.
const FONT_INPUT = CHAT_FONT_SIZE;
const LINE_H = CHAT_LINE_HEIGHT;
const FIELD_PAD_X = 8.5; // padding de la fila de botones dentro del campo
const TEXT_PAD_X = 12; // el texto va 3.5pt más adentro que la fila
const TEXT_PAD_TOP = 16; // Figma da 10.88; se sube a pedido — el campo respira mejor en pantalla
const ROW_PAD_BOTTOM = 9; // menos que TEXT_PAD_TOP a propósito: baja la fila de botones
const TEXT_TO_ROW_GAP = 18;
const BTN_PLUS = 36; // Figma da 31.23; se sube a pedido — mejor toque en pantalla real
const BTN_SYMBOL = 36; // mic / enviar
const BTN_ICON = 24;
// MISMA altura que los botones redondos: la fila tiene que alinear. El aire alrededor del contenido
// no se consigue estirando la cápsula (eso la desalinea del `+`), sino con un contenido más
// pequeño dentro — que es la proporción real del nodo 675:16944.
const PILL_H = BTN_PLUS;
// Figma da 24.586, pero eso supera la MITAD de esta altura (36/2 = 18) y RN lo recorta a cápsula:
// los extremos salen elípticos. El valor de Figma corresponde a una píldora de otra proporción.
// Una sola constante para el contorno y para el trazo SVG — si se separan, el borde deja de
// coincidir con el fondo y asoma una línea.
const PILL_RADIUS = 18;
const PRO_SIZE = 36;
const ORB_SIZE = 36;
const LEFT_GAP = 5;
const RIGHT_GAP = 8.88;

// Degradado del botón PRO. Figma da 92.44° colapsado y 97.84° expandido — una diferencia
// imperceptible que nace de rotar el mismo relleno sobre una caja más ancha, no de un cambio de
// diseño. Se usa un solo ángulo horizontal para ambos.

/**
 * Botón de herramienta SÓLIDO — deliberadamente NO es un `GlassButton`.
 *
 * Medido contra el input de la app de Claude: su `+`, su píldora y su micrófono son opacos y
 * planos; solo la placa exterior es cristal. Y la skill `cuadra-glass-button` (gotcha 8) dice lo
 * mismo por la vía técnica: apilar dos `GlassView` nativos OSCURECE de más — una capa de vidrio
 * por zona. Meter GlassButtons aquí dentro era cristal sobre cristal, y por eso el bar se veía
 * turbio. `GlassButton` sigue intacto para el resto de la app, donde sí es la capa única.
 */
function ToolButton({
  icon,
  label,
  size,
  onPress,
  accent = false,
  isDark,
}: {
  icon: LucideIcon;
  label: string;
  size: number;
  onPress?: () => void;
  accent?: boolean;
  isDark: boolean;
}) {
  // SIN muelle propio, a diferencia de `GlassButton`: quien rebota es la TARJETA entera. Dos
  // muelles anidados (botón + tarjeta) se pisan y el gesto se lee doble y sucio.

  // Más OSCUROS que la placa de cristal, como en la referencia: el contraste va hacia abajo, no
  // hacia arriba. Un botón más claro que su fondo lo hace flotar y rompe la lectura del material.
  const bg = accent ? "#C2FB7E" : isDark ? "rgba(0,20,17,0.85)" : "rgba(232,245,224,0.95)";
  const iconColor = accent ? "#002E22" : isDark ? "#C2FB7E" : "#002E22";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
      }}
    >
      <Icon as={icon} size={BTN_ICON} color={iconColor} />
    </Pressable>
  );
}

/**
 * Contador de mensajes gratis. Es UN USO de `PillButton`, no un componente aparte: la forma, el
 * canto en degradado y los colores por tema viven en `@/components/ui/pill-button`, y aquí solo
 * queda lo que es propio de este caso — el icono por tema y el texto. Sin acción todavía.
 */
function FreeMessagesButton({ isDark }: { isDark: boolean }) {
  return (
    <PillButton
      icon={isDark ? <SparkDark width={18} height={18} /> : <SparkLight width={18} height={18} />}
      label={t("chat.freeMessages", { used: "0", total: "5" })}
      accessibilityLabel={t("chat.a11y.freeMessages")}
      height={PILL_H}
      radius={PILL_RADIUS}
    />
  );
}

/**
 * Botón "Cuadra PRO" — es SOLO el PNG. Nada de píldora, borde, degradado ni expansión: el arte
 * exportado de Figma ya lleva el disco, el brillo y el logo dentro, así que envolverlo en un
 * contenedor era duplicar lo que la imagen ya dibuja. Sin acción todavía (otra historia).
 */
function ProButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("chat.a11y.pro")}>
      <Image
        source={require("../../../assets/chat/pro-logo.png")}
        style={{ width: PRO_SIZE, height: PRO_SIZE }}
        resizeMode="contain"
      />
    </Pressable>
  );
}

// Huella para reconocer el ECO del autocorrector (ver `handleChangeText`). Ignora EXACTAMENTE lo
// que iOS puede cambiar al confirmar su candidato —mayúsculas y TILDES— y nada más:
//   "amazon" → "Amazon"   (mayúscula)
//   "Super"  → "Súper"    (tilde; caso real en device, 2026-08-09)
// `NFD` separa cada letra de su tilde en dos code points, y el rango U+0300–U+036F (marcas
// diacríticas combinantes) borra la segunda. Escrito con ESCAPES, no con los caracteres literales:
// son glifos invisibles que cualquier formateador o copy-paste puede comerse en silencio. Y por
// rango en vez de `\p{Diacritic}`: las property escapes de Unicode exigen soporte del motor, y
// esto tiene que correr igual en Hermes.
//
// La comparación es CONSERVADORA a propósito: normalizar de más (quitar puntuación, espacios,
// comparar por parecido) haría que un mensaje nuevo y parecido al anterior se coma solo. Perder
// texto que el usuario SÍ escribió es peor que dejar un eco en el campo.
const echoFingerprint = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// `inputRef` is optional — the screen passes one in so it can dismiss/restore the keyboard around
// the sessions drawer (hide on open, refocus on close). `onSend` receives the trimmed message when
// the user taps send (the screen streams it to the chat); without it the bar just clears.
export function ChatInputBar({ inputRef: externalRef, onSend }: ChatInputBarProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [value, setValue] = useState("");
  const [fieldSize, setFieldSize] = useState<{ w: number; h: number } | null>(null);
  const localRef = useRef<TextInput>(null);
  const inputRef = externalRef ?? localRef;
  const hasText = value.trim().length > 0;
  // The exact text we just sent (lowercased) — set on Send, cleared on the next real edit. See
  // `handleChangeText` below for why this beats a synchronous clear() alone.
  const lastSentRef = useRef<string | null>(null);

  // `regular`, NO `clear`: sobre fondo negro `clear` no tiene nada que dejar pasar; la esmerilada
  // tiene luminosidad propia. Valores tomados de `expo-morphing-menu` (bottom-input-surface.tsx),
  // que usa este mismo `expo-glass-effect`:
  //   tintColor: scheme === "dark" ? "#1c1c1e38" : "#f2f2f7"
  // El `38` final es ALFA (~22%): un gris OSCURO translúcido, no un blanco tenue. Un tinte blanco
  // lava el material y lo deja lechoso; el gris oscuro le da cuerpo sin tapar la refracción.
  // Claro: BLANCO con alfa, no el `#f2f2f7` del repo de referencia — ese es el systemGray6 de iOS
  // y lleva una componente AZUL que en tema claro se lee lavanda. Ellos diseñan sobre gris; aquí
  // el fondo es blanco. Mismo patrón de hex de 8 dígitos: los dos últimos son el alfa.
  const fieldTint = isDark ? "#1c1c1e38" : "#ffffff8c";
  const inputColor = isDark ? "#FFFFFF" : "#034842";
  const placeholderColor = isDark ? "#6A6A6A" : "#BEC2C0";
  const cursorColor = isDark ? "#DEFFB7" : "#034842";

  const handleSend = () => {
    if (!hasText) return;
    const trimmed = value.trim();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sounds.send();
    onSend?.(trimmed);
    lastSentRef.current = echoFingerprint(trimmed);
    setValue(""); // clear the field (and revert the button back to the orb)
    inputRef.current?.clear();
  };

  // iOS can commit a pending autocorrect/predictive-text candidate on a NATIVE event that fires
  // AFTER handleSend already ran — a plain setValue("")/.clear() in handleSend loses that race, so
  // the corrected text (e.g. "amazon" → "Amazon", "Super" → "Súper") reappears in the field right
  // after sending. If the incoming text has the same fingerprint as the message we JUST sent, it's
  // that late echo, not new typing — swallow it. Any OTHER change clears the guard so real typing
  // is never eaten.
  const handleChangeText = (text: string) => {
    if (lastSentRef.current !== null && echoFingerprint(text) === lastSentRef.current) {
      lastSentRef.current = null;
      setValue("");
      inputRef.current?.clear();
      return;
    }
    lastSentRef.current = null;
    setValue(text);
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 }}>
      <View
        style={{
          // La SOMBRA es lo que despega el cristal del fondo: sin ella la placa queda pegada y lee
          // como un rectángulo pintado, por muy correcto que esté el material. Valores tomados de
          // `expo-morphing-menu` (bottom-input.styles.ts → `glass`), que usa este mismo
          // `expo-glass-effect`. Va en el CONTENEDOR, no en el GlassSurface: en iOS una sombra y un
          // `overflow: hidden` en la misma vista se recortan entre sí.
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        {/* El cristal ENVUELVE el contenido para poder RECIBIR el toque: `isInteractive` es un
            efecto del material bajo el dedo, y como fondo `absoluteFill` nunca le llegaba un solo
            evento — por eso el rebote no se notaba.
            Pero el gotcha 9 de `cuadra-glass-button` prohíbe que un GlassSurface AUTO-dimensione
            contenido que crece (este campo pasa de 90 a 128pt al escribir): bajo Fabric se mal-mide
            en el re-layout y la zona se despega de donde está anclada.
            Se cumplen las dos cosas dándole la altura MEDIDA como NÚMERO: envuelve y recibe toques,
            pero no es él quien decide cuánto mide. Quien mide es la View interna. */}
        <GlassSurface
          glassEffectStyle="regular"
          // El rebote lo hace el MATERIAL NATIVO sobre toda la tarjeta. No se le superpone ningún
          // muelle propio: dos animaciones a la vez se pelean y el gesto se lee doble.
          isInteractive
          tint={fieldTint}
          tintOpacity={0.22}
          // NI `height` fijo NI `overflow: hidden`. `isInteractive` deforma la GEOMETRÍA del
          // cristal bajo el dedo: con la altura clavada no puede cambiar de tamaño y lo único que
          // le queda es comprimir el contenido (la tarjeta se quedaba estática), y el `overflow`
          // recortaba cualquier deformación hacia fuera. Deja que el material mande en su forma.
          // SIN borde de ningún tipo — ni prop ni `style`. El repo de referencia no dibuja ninguno:
          // el filo que se ve en su UI es el canto propio del material. Un borde de RN se queda
          // estático mientras el cristal rebota, y en las esquinas asoma como una línea blanca.
          // `borderCurve: "continuous"` = curvatura continua de iOS (el squircle de Apple), nativo
          // de RN. NOTA: está por confirmar que llegue a las capas internas del UIVisualEffectView;
          // si no se nota, la causa es esa y no el valor del radio.
          style={{ borderRadius: FIELD_RADIUS, borderCurve: "continuous" }}
        >
          <View
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setFieldSize((prev) =>
                prev?.w === width && prev?.h === height ? prev : { w: width, h: height },
              );
            }}
            style={{ paddingTop: TEXT_PAD_TOP, paddingBottom: ROW_PAD_BOTTOM }}
          >
            {/* Tocar cualquier hueco VACÍO de la tarjeta abre el teclado. Va DETRÁS del contenido
                (primero en el árbol, `absoluteFill`), nunca envolviéndolo: un Pressable alrededor
                ya interceptó el toque antes y competía con el foco del TextInput multilínea,
                costando taps extra. Así los toques en botones y campo llegan a ellos, y solo los
                que caen en hueco muerto alcanzan este fondo. */}
            <Pressable
              accessible={false}
              onPress={() => inputRef.current?.focus()}
              style={StyleSheet.absoluteFill}
            />
        {/* El texto va ARRIBA y los botones abajo — al revés que el diseño anterior, que era una
            sola fila horizontal. El campo crece hacia abajo: 90pt vacío, +19 por línea. */}
        <TextInput
          ref={inputRef}
          multiline
          textAlignVertical="top"
          style={{
            fontSize: FONT_INPUT,
            lineHeight: LINE_H,
            color: inputColor,
            // Un TextInput MULTILINE en iOS mide ~34-40pt de alto natural aunque tenga una sola
            // línea, lo que empujaba la fila de botones y hacía el campo más alto que los 90pt del
            // diseño. Fijar min/max en múltiplos de la línea lo ata a la medida real de Figma.
            minHeight: LINE_H,
            maxHeight: LINE_H * 5, // 5 líneas y luego scrollea por dentro
            paddingHorizontal: TEXT_PAD_X,
            paddingTop: 0,
            paddingBottom: 0,
            // Fuente del SISTEMA (ver chat-typography): se escribe en el mismo tipo en que se lee.
            ...CHAT_BODY,
          }}
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor={placeholderColor}
          selectionColor={cursorColor}
          cursorColor={cursorColor}
          value={value}
          onChangeText={handleChangeText}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: FIELD_PAD_X,
            marginTop: TEXT_TO_ROW_GAP,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: LEFT_GAP }}>
            <ToolButton icon={Plus} label={t("chat.a11y.attach")} size={BTN_PLUS} isDark={isDark} />
            <FreeMessagesButton isDark={isDark} />
            <ProButton />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: RIGHT_GAP }}>
            <ToolButton icon={Mic} label={t("chat.a11y.voice")} size={BTN_SYMBOL} isDark={isDark} />
            {/* Orbe ⇄ Enviar: el campo vacío muestra el orbe del asistente; en cuanto hay texto
                intercambia (zoom) por la flecha. Caja fija para que el cambio no mueva el layout —
                en Figma ambos ocupan LITERALMENTE el mismo slot (el orbe aparece `hidden` en el
                estado escrito). */}
            <View style={{ width: BTN_SYMBOL, height: BTN_SYMBOL }}>
              {hasText ? (
                <Animated.View
                  key="send"
                  entering={ZoomIn.duration(180)}
                  exiting={ZoomOut.duration(150)}
                  style={StyleSheet.absoluteFill}
                >
                  <ToolButton
                    icon={ArrowUp}
                    label={t("chat.a11y.send")}
                    size={BTN_SYMBOL}
                    accent
                    isDark={isDark}
                    onPress={handleSend}
                  />
                </Animated.View>
              ) : (
                <Animated.View
                  key="orb"
                  entering={ZoomIn.duration(180)}
                  exiting={ZoomOut.duration(150)}
                  style={StyleSheet.absoluteFill}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("chat.a11y.assistant")}
                    style={{ width: ORB_SIZE, height: ORB_SIZE }}
                  >
                    {/* El orbe NO se redibuja: en Figma es un compuesto de máscaras con
                        mix-blend-screen y plus-lighter, irreproducible en RN. Es el PNG exportado. */}
                    <Image
                      source={require("../../../assets/chat/orb-assistant.png")}
                      style={{ width: ORB_SIZE, height: ORB_SIZE }}
                      resizeMode="contain"
                    />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          </View>
        </View>
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}
