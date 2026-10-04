import { beforeEach, describe, expect, test, vi } from "vitest";

import { AUTO_HIDE_MS, useOrbStore } from "./orb-store";

/**
 * El auto-ocultado del orbe es para el ABANDONO. Un dedo apoyado es lo contrario, y aun así el orbe
 * se cerraba en mitad del gesto: `setPressing(true)` cancelaba el temporizador y el `bump()` de la
 * línea siguiente lo volvía a armar.
 *
 * Se prueba con relojes falsos porque el defecto es TEMPORAL: sin adelantar el reloj no se
 * manifiesta, y a un plazo real de espera nadie escribiría este test.
 *
 * ⚠️⚠️ **Los tiempos se DERIVAN de `AUTO_HIDE_MS`, nunca se escriben.** Estaban a mano —7 s y 9 s
 * alrededor de los 8 originales— y al subir el plazo los dos rompieron: uno afirmaba que a los 9 s
 * el orbe ya estaba cerrado, que era verdad sobre el número viejo y falso sobre el nuevo. El plazo
 * ha cambiado DOS veces desde entonces (16, luego 24) y estos tests no se han tocado ni una: eso es
 * exactamente lo que se ganó.
 * Lo que hay que afirmar es la RELACIÓN —antes del plazo sigue, pasado se va—; el número es del
 * store y el test no tiene por qué opinar.
 */
describe("orb-store · auto-ocultado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOrbStore.getState().hide();
  });

  // ⚠️ Estos dos medían la espera con 60 s, que ahora cae del lado del GESTO PERDIDO (tope de 30 s,
  // ver `LOST_GESTURE_MS`). El invariante no cambia —un dedo apoyado no es abandono— pero deja de
  // ser infinito: 25 s siguen siendo un gesto creíble y es ahí donde hay que medirlo.
  test("con el dedo APOYADO no se cierra mientras el gesto sea creíble", () => {
    const { show, setPressing, bump } = useOrbStore.getState();
    show();
    // El orden EXACTO de la barra: primero se marca la pulsación, luego se golpea la onda.
    setPressing(true);
    bump();

    vi.advanceTimersByTime(25_000);

    expect(useOrbStore.getState().active).toBe(true);
  });

  test("al SOLTAR vuelve a contar, y entonces sí se cierra", () => {
    const { show, setPressing } = useOrbStore.getState();
    show();
    setPressing(true);
    vi.advanceTimersByTime(25_000);
    setPressing(false);

    // Recién soltado sigue abierto: la cuenta empieza de CERO, no arrastra lo ya esperado. Si
    // arrastrara, los 25 s de gesto ya habrían agotado el plazo y se cerraría al instante.
    vi.advanceTimersByTime(AUTO_HIDE_MS - 1_000);
    expect(useOrbStore.getState().active).toBe(true);

    vi.advanceTimersByTime(2_000);
    expect(useOrbStore.getState().active).toBe(false);
  });

  test("un segundo evento de soltar es idempotente y no reinicia la transición", () => {
    const { show, setPressing } = useOrbStore.getState();
    show();
    setPressing(true);
    setPressing(false);

    // iOS puede entregar release y luego terminate/cancel para el mismo contacto.
    setPressing(false);
    expect(useOrbStore.getState()).toMatchObject({ active: true, pressing: false });
  });

  test("sin tocarlo, se cierra solo", () => {
    useOrbStore.getState().show();

    // Justo antes del plazo todavía está: el cierre es por ABANDONO, y hasta cumplirse no lo hay.
    vi.advanceTimersByTime(AUTO_HIDE_MS - 1_000);
    expect(useOrbStore.getState().active).toBe(true);

    vi.advanceTimersByTime(2_000);
    expect(useOrbStore.getState().active).toBe(false);
  });



  test("un gesto que nunca termina NO deja el orbe bloqueado para siempre", () => {
    // ⚠️⚠️ **El bloqueo que dejó la app inservible: velo puesto y orbe encendido, sin salida.**
    //
    // `PanResponder` entrega el *grant* y, si la vista se desmonta a mitad del gesto, puede no
    // entregar nunca el *release*. `holding` se queda en true, el auto-ocultado se inhibe —porque
    // un dedo apoyado es lo contrario del abandono— y `pressing` mantiene el velo encendido. No hay
    // nada en la app capaz de salir de ahí: ni recargar el JS, porque el gesto se vuelve a perder.
    //
    // La guarda de `holding` es correcta; lo que faltaba era un TOPE. Un dedo humano no se queda
    // apoyado medio minuto: pasado ese tiempo la señal no es un gesto, es un gesto PERDIDO.
    const { show, setPressing } = useOrbStore.getState();
    show();
    setPressing(true); // …y nunca llega el release

    vi.advanceTimersByTime(60_000);

    expect(useOrbStore.getState().pressing).toBe(false);
    expect(useOrbStore.getState().active).toBe(false);
  });

  /**
   * ⭐⭐⭐ **DICTAR NO ES UNA RAZÓN PARA CERRAR EL ORBE — es la prueba de que se está usando.**
   *
   * El ciclo de voz mantiene el orbe con `setLensHold(true)` mientras el reconocedor y el telón
   * viven, y al terminar lo suelta. En ese momento la cuenta tiene que empezar DE CERO: el usuario
   * acaba de recuperar el control y cerrárselo de golpe sería castigarle por haber hablado.
   *
   * La previsión estaba en el store desde el principio, pero no servía de nada: `orb-liquid-focus`
   * llamaba a `hideOrb()` 620 ms después de navegar al chat, así que el orbe se esfumaba al aterrizar
   * y este camino nunca llegaba a ejecutarse. Se quitó aquella llamada; este test es lo que impide
   * que vuelva.
   */
  test("terminado el dictado, la cuenta empieza de CERO —no se cierra al aterrizar", () => {
    const { show, setLensHold } = useOrbStore.getState();
    show();

    // El ciclo de voz retiene el orbe mientras dura, más de lo que dura el propio ocioso.
    setLensHold(true);
    vi.advanceTimersByTime(AUTO_HIDE_MS + 5_000);
    expect(useOrbStore.getState().active).toBe(true);

    // Y al soltarlo NO se cierra: vuelve a tener el plazo entero por delante.
    setLensHold(false);
    vi.advanceTimersByTime(AUTO_HIDE_MS - 1_000);
    expect(useOrbStore.getState().active).toBe(true);

    vi.advanceTimersByTime(2_000);
    expect(useOrbStore.getState().active).toBe(false);
  });

  test("el ocioso cierra ANTES que el tope del gesto perdido", () => {
    // Si el tope llegara primero, el plazo de abandono dejaría de significar nada: el orbe se
    // cerraría siempre por la otra puerta y subirlo o bajarlo no cambiaría nada de lo que se ve.
    const { show } = useOrbStore.getState();
    show();

    vi.advanceTimersByTime(AUTO_HIDE_MS + 1_000);

    expect(useOrbStore.getState().active).toBe(false);
  });
});