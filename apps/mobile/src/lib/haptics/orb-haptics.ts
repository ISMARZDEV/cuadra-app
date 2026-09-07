import * as Haptics from "expo-haptics";

/**
 * EL LENGUAJE HÁPTICO DEL ORBE, en un solo sitio.
 *
 * ⭐ **Cada golpe corresponde a un SUCESO REAL**, nunca a un temporizador. Un háptico que late solo
 * se siente como un aviso del sistema y la gente aprende a ignorarlo; uno que responde a algo que
 * acaba de pasar enseña qué pasó. Por eso el tic de dictado va atado a que llegue una PALABRA nueva
 * y no a un intervalo.
 *
 * ⭐⭐ **La receta base sale del propio shot de referencia** —`.impact(medium, 0.8)` al escuchar,
 * `.impact(light)` al procesar, `.success` al resolver— y aquí se sube un escalón porque el usuario
 * pidió sentirlo más: la entrada pasa a `Heavy` y se le añade un segundo golpe.
 *
 * ⚠️ **iOS DESACTIVA TODOS LOS HÁPTICOS EN MODO DE BAJO CONSUMO.** Si no se siente nada, eso es lo
 * primero que hay que descartar — es del sistema y ninguna de estas llamadas puede sortearlo.
 * También hacen falta un iPhone con Taptic Engine y el interruptor de sistema activo.
 */

/** Espera entre los dos golpes del arranque. Corta: si se separan más se sienten como DOS avisos. */
const THUNK_GAP_MS = 55;

/**
 * ARRANCA LA ESCUCHA — el golpe más contundente de la interacción.
 *
 * Son DOS impactos encadenados, no uno más fuerte: `Heavy` no tiene nada por encima, así que el
 * peso extra se consigue con un segundo toque muy pegado. El oído háptico lo lee como un «thunk»
 * único y macizo —el mismo truco de un cierre de puerta de coche— en lugar de dos avisos.
 */
export function orbListenStart(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  }, THUNK_GAP_MS);
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
