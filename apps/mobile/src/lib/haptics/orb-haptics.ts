import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import type { StairStyle } from "@/features/aispace/voice/send-stairs";

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
 * ⚠️⚠️ **CUÁNDO NO SE SIENTE NADA, Y NO ES CULPA DE ESTE CÓDIGO.** La doc de `expo-haptics` (v56)
 * enumera las condiciones en que iOS deja inerte el Taptic Engine, y ninguna se puede sortear desde
 * aquí: modo de bajo consumo, el interruptor de sistema apagado, la CÁMARA activa y —importa para
 * este flujo— **mientras corre la DICTATION**. Añade a eso que **en el simulador no existe**: los
 * hápticos sólo se pueden verificar en un dispositivo real.
 *
 * ⚠️⚠️ **Y HAY UN TECHO DE CADENCIA.** El motor sólo separa pulsos a partir de ~100 ms, y su cola
 * interna se desborda con llamadas seguidas descartándolas EN SILENCIO —el síntoma clásico es que
 * funciona el primer segundo y luego muere—. Cualquier patrón repetido va contra ese límite: por eso
 * el latido del envío tiene su plan en `send-pulse`, con tests que lo vigilan.
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
 * UN TOQUE DEL LATIDO QUE ANUNCIA EL ENVÍO.
 *
 * ⭐⭐ **`Soft` y no `Light`: es el más DIFUSO de la familia**, sin canto definido. Un impacto nítido
 * dice «ha pasado algo» y pide atención; éste dice «sigo aquí» y se puede repetir sin cansar, que es
 * justo lo que necesita un estado que dura segundos. Lo pidió así: «algo suave».
 *
 * ⚠️ La FORMA del latido no está aquí: está en el ritmo (`send-pulse`). `expo-haptics` no da
 * intensidad variable —eso es Core Haptics, y exige un módulo nativo—, así que la envolvente se
 * consigue con el ESPACIADO y el silencio, no con la amplitud.
 *
 * En Android, `Segment_Tick` es el equivalente sutil: el tic de un recorrido en curso, no un aviso.
 */
export function orbSendPulse(platform = Platform.OS): void {
  if (platform === "android") {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
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

/**
 * UN PELDAÑO DE LA ESCALERA DEL ENVÍO.
 *
 * ⭐⭐ **El carácter lo decide el AUDIO, no el gusto.** El clip sube de 258 a 786 Hz en cuatro
 * golpes, así que el dedo tiene que subir con él: `Soft` es difuso y sin canto, `Light` ya se
 * localiza, `Rigid` es el más nítido de la familia. Es lo más parecido a un barrido de tono que
 * `expo-haptics` puede decir — la «sharpness» de verdad es Core Haptics, y eso pide módulo nativo.
 *
 * ⚠️ Los peldaños van a 100 ms exactos, el mínimo que el motor separa. Si en el dispositivo se
 * sintiera un solo golpe en vez de tres, el problema no está aquí sino en `send-stairs`: ahí se
 * documenta el repliegue a dos peldaños.
 */
export function orbStairStep(style: StairStyle, platform = Platform.OS): void {
  if (platform === "android") {
    const android = {
      soft: Haptics.AndroidHaptics.Segment_Tick,
      light: Haptics.AndroidHaptics.Segment_Frequent_Tick,
      rigid: Haptics.AndroidHaptics.Confirm,
    } as const;
    void Haptics.performAndroidHapticsAsync(android[style]);
    return;
  }
  const ios = {
    soft: Haptics.ImpactFeedbackStyle.Soft,
    light: Haptics.ImpactFeedbackStyle.Light,
    rigid: Haptics.ImpactFeedbackStyle.Rigid,
  } as const;
  void Haptics.impactAsync(ios[style]);
}
