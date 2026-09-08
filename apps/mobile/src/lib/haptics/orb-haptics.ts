import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * EL LENGUAJE HÁPTICO DEL ORBE, en un solo sitio.
 *
 * ⭐ **Cada golpe corresponde a un SUCESO REAL**, nunca a un temporizador. Un háptico que late solo
 * se siente como un aviso del sistema y la gente aprende a ignorarlo; uno que responde a algo que
 * acaba de pasar enseña qué pasó. Por eso el tic de dictado va atado a que llegue una PALABRA nueva
 * y no a un intervalo.
 *
 * ⭐⭐ La presión física es UN solo suceso. Antes el arranque encadenaba `Heavy` + `Rigid` 55 ms
 * después: dos avisos para una acción, y el segundo podía coincidir con el inicio del micrófono. La
 * receta actual usa el significado NATIVO de cada plataforma: contacto rígido en iOS y tecla
 * virtual en Android. Se dispara en press-in, en el mismo gesto que contrae el control.
 *
 * ⚠️ **iOS DESACTIVA TODOS LOS HÁPTICOS EN MODO DE BAJO CONSUMO.** Si no se siente nada, eso es lo
 * primero que hay que descartar — es del sistema y ninguna de estas llamadas puede sortearlo.
 * También hacen falta un iPhone con Taptic Engine y el interruptor de sistema activo.
 */

/**
 * EL DEDO HUNDE EL ORBE — corto y definido, como tocar un botón físico.
 */
export function orbListenStart(platform = Platform.OS): void {
  if (platform === "android") {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key);
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
}

/**
 * LLEGÓ UNA PALABRA NUEVA al dictado.
 *
 * `selectionAsync` y no un impacto: es el tic seco del selector de fecha de iOS, pensado para
 * repetirse muchas veces sin cansar. Un `Light` por palabra sería un martilleo.
 */
export function orbTranscriptTick(): void {
  void Haptics.selectionAsync();
}

/**
 * SE SOLTÓ Y HAY TEXTO — la confirmación.
 *
 * `.success` del sistema: tres pulsos ascendentes. Es el `sensoryFeedback(.success)` que el shot de
 * referencia dispara al resolver, y es la única señal de la secuencia que significa «salió bien».
 */
export function orbCaptureSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * SE SOLTÓ SIN HABER DICHO NADA.
 *
 * Un `Light` seco, NO un `.warning`: no haber hablado no es un error del usuario ni un fallo de la
 * app. Marcar con señal de aviso algo que simplemente no ocurrió enseña a temer el gesto.
 */
export function orbCaptureEmpty(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * SE DESCARTÓ (deslizando hacia abajo).
 *
 * ⚠️ **Deliberadamente el más flojo, y NUNCA el de confirmación.** Premiar una cancelación con la
 * misma señal que un envío enseña al dedo exactamente lo contrario de lo que queremos.
 */
export function orbDismiss(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
}

/**
 * SE EJECUTÓ UN COMANDO de dictado («borra eso», «empieza de nuevo»).
 *
 * ⚠️ Necesita señal PROPIA, y no es un adorno: sin ella, obedecer una orden y no haber entendido al
 * usuario se ven EXACTAMENTE IGUAL —el texto desaparece— y no hay forma de saber cuál de las dos
 * pasó. Un `Warning` del sistema (dos pulsos) se distingue del tic de palabra y del éxito final.
 */
export function orbCommandApplied(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
