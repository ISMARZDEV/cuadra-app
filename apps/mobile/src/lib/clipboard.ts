import { Clipboard } from "react-native";

/**
 * Único punto del proyecto que toca el portapapeles.
 *
 * ⚠️ **Deuda conocida, aislada a propósito acá.** `Clipboard` sigue funcionando en RN 0.85 (es un
 * envoltorio delgado sobre `NativeClipboard`), pero el core avisa al importarlo que fue extraído y
 * que lo van a quitar en una versión futura. El reemplazo correcto es `expo-clipboard` — que es un
 * módulo NATIVO y por lo tanto exige `expo prebuild` + rebuild del dev-client.
 *
 * Se eligió el de core para no bloquear la fila de acciones tras una recompilación. Cuando toque
 * migrar, es ESTE archivo y nada más:
 *
 *     import * as ExpoClipboard from "expo-clipboard";
 *     export const copyToClipboard = (text: string) => void ExpoClipboard.setStringAsync(text);
 */
export function copyToClipboard(text: string): void {
  Clipboard.setString(text);
}
