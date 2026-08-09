import { useEffect, useRef, useState } from "react";
import { Pressable, Share, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Copy, Ellipsis, Share2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";
import { copyToClipboard } from "@/lib/clipboard";
import { t, useLang } from "@/i18n";

import type { MessageActionsProps } from "../interfaces";

const ICON_SIZE = 16;
/** Separación entre acciones. Ajustado a pedido tuyo: la fila se lee como UN grupo, no como
 *  botones sueltos. El `hitSlop` de cada Pressable mantiene el área táctil por encima del mínimo
 *  de 44pt aunque el dibujo quede más junto — apretar el gap NO achica el blanco del dedo. */
const ACTION_GAP = 14;
/** Cuánto dura la confirmación de copiado. Exportado para que el test no duplique el número. */
export const COPIED_MS = 1600; // lo justo para verse; más tiempo y parece que se trabó

// Fila de acciones bajo una respuesta TERMINADA del agente.
//
// COPIAR y COMPARTIR (funcionan) + una ELIPSIS de sitio (todavía inerte, ver abajo). Las otras
// cuatro del diseño (leer en voz alta, pulgar arriba/abajo, regenerar) no entran todavía: los
// pulgares necesitan un endpoint de feedback que no existe, regenerar necesita rebobinar el
// checkpoint del grafo, y el TTS es una decisión de producto pendiente. Un botón que PROMETE una
// acción y no la hace es peor que no mostrarlo (§7.3 del plan).
//
// Peso visual: el diseño de referencia los tiene finos, discretos y apagados. Van en el MISMO gris
// que la línea de estado, nunca en verde de marca — seis (o dos) iconos con color compiten con el
// texto que están acompañando.
export function MessageActions({ text }: MessageActionsProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { colorScheme } = useColorScheme();
  const tint = colorScheme === "dark" ? "#9CA3AF" : "#6B7280";

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El temporizador tiene que morir con el componente: la lista del chat desmonta mensajes al
  // navegar, y un setState sobre un nodo muerto es un warning (y una fuga).
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleCopy = () => {
    copyToClipboard(text);
    void Haptics.selectionAsync();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const handleShare = () => {
    // `message` es lo único que viaja: la hoja nativa decide cómo lo entrega cada destino.
    void Share.share({ message: text, title: t("chat.share.title") });
  };

  return (
    <View className="flex-row items-center pt-2" style={{ gap: ACTION_GAP }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? t("chat.a11y.copied") : t("chat.a11y.copy")}
        hitSlop={8}
        onPress={handleCopy}
      >
        {/* El icono ES la confirmación: sin toast ni infraestructura, y sin mover el layout — el
            portapapeles es invisible, así que sin esto no hay forma de saber si el toque registró. */}
        <Icon as={copied ? Check : Copy} size={ICON_SIZE} color={tint} strokeWidth={1.8} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.a11y.share")}
        hitSlop={8}
        onPress={handleShare}
      >
        <Icon as={Share2} size={ICON_SIZE} color={tint} strokeWidth={1.8} />
      </Pressable>

      {/* Elipsis = «hay más», y por ahora NO abre nada: pedido explícito tuyo. Es la única excepción
          a la regla de arriba («un botón que no hace nada es peor que no mostrarlo»), y se sostiene
          porque una elipsis no PROMETE una acción concreta —como sí lo haría un pulgar o un play—,
          sólo insinúa un menú. Cuando exista el menú, cuelga de acá sin mover el resto de la fila.
          Sin `disabled`: apagarlo visualmente lo delataría como inerte. */}
      <Pressable accessibilityRole="button" accessibilityLabel={t("chat.a11y.more")} hitSlop={8}>
        <Icon as={Ellipsis} size={ICON_SIZE} color={tint} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}
