import { describe, expect, test } from "vitest";

import {
  AUDIO_ONSETS_MS,
  EXIT_STAIR_ONSETS_MS,
  MIN_TAPTIC_GAP_MS,
  STAIR_ONSETS_MS,
  stairStyleAt,
} from "./send-stairs";

describe("la escalera háptica del envío", () => {
  /**
   * ⭐⭐⭐ **EL HÁPTICO NO INVENTA TIEMPOS: CAE SOBRE GOLPES QUE EXISTEN EN EL AUDIO.**
   *
   * Es la diferencia entre acompañar y coincidir. Un patrón inventado que dura «más o menos lo
   * mismo» se percibe como una vibración QUE VA CON el sonido; cayendo en sus ataques reales, se
   * percibe como el sonido MISMO teniendo cuerpo. Y es lo único que sobrevive a que alguien
   * sustituya el clip: si los onsets nuevos no coinciden, este test lo dice.
   */
  test("cada peldaño coincide con un ataque REAL del clip", () => {
    const inventados = STAIR_ONSETS_MS.filter((t) => !AUDIO_ONSETS_MS.includes(t));
    expect(inventados).toEqual([]);
  });

  /**
   * ⭐⭐⭐ **Y POR ESO NO PUEDEN SER LOS CUATRO.** El clip tiene sus golpes a 50, 50 y 100 ms, y el
   * Taptic Engine no separa nada por debajo de ~100: pedirle los cuatro devolvería un borrón, no una
   * escalera. Se toma el subconjunto MÁXIMO que el motor puede pronunciar.
   */
  test("ningún peldaño cae antes de que el motor pueda separarlo del anterior", () => {
    const huecos = STAIR_ONSETS_MS.slice(1).map((v, i) => v - STAIR_ONSETS_MS[i]);
    expect(huecos.filter((g) => g < MIN_TAPTIC_GAP_MS)).toEqual([]);
  });

  test("se aprovechan todos los peldaños que el motor SÍ puede pronunciar", () => {
    // Si cupiera uno más y no estuviera, la escalera sería más pobre de lo que el hardware permite.
    const maximo: number[] = [];
    for (const t of AUDIO_ONSETS_MS) {
      if (maximo.length === 0 || t - maximo[maximo.length - 1] >= MIN_TAPTIC_GAP_MS) maximo.push(t);
    }
    expect([...STAIR_ONSETS_MS]).toEqual(maximo);
  });

  test("la escalera ASCIENDE: cada peldaño es más nítido que el anterior", () => {
    // El audio sube de 258 a 786 Hz. Un háptico que se apagara contradiría lo que se oye — y cuando
    // el oído y el dedo discrepan, gana el oído y la vibración se siente «mal puesta».
    const orden = STAIR_ONSETS_MS.map((_, i) => stairStyleAt(i));
    expect(orden).toEqual(["soft", "light", "rigid"]);
  });

  test("los ataques medidos van en orden y dentro del clip", () => {
    for (let i = 1; i < AUDIO_ONSETS_MS.length; i++) {
      expect(AUDIO_ONSETS_MS[i]).toBeGreaterThan(AUDIO_ONSETS_MS[i - 1]);
    }
    // El clip audible acaba en torno a 1,3 s: un onset fuera de ahí sería un error de medición.
    expect(AUDIO_ONSETS_MS[AUDIO_ONSETS_MS.length - 1]).toBeLessThan(1300);
  });
});

describe("la escalera de la SALIDA", () => {
  /**
   * ⭐⭐⭐ **ARRANCA EN CERO, y no es un detalle.** La escalera del sonido se pega a los ataques del
   * clip porque tiene un audio al que agarrarse; ésta acompaña un MOVIMIENTO, y un movimiento
   * empieza cuando empieza. Copiando aquí los offsets del audio, la onda ya estaría subiendo 200 ms
   * antes de que llegara el primer peldaño — el háptico se leería como un eco de lo que se ve.
   */
  test("el primer peldaño cae CON el movimiento, no después", () => {
    expect(EXIT_STAIR_ONSETS_MS[0]).toBe(0);
  });

  test("respeta el mismo techo del motor que la otra escalera", () => {
    const huecos = EXIT_STAIR_ONSETS_MS.slice(1).map((v, i) => v - EXIT_STAIR_ONSETS_MS[i]);
    expect(huecos.filter((g) => g < MIN_TAPTIC_GAP_MS)).toEqual([]);
  });

  test("es la MISMA escalera: mismos peldaños y misma subida", () => {
    // Si tuvieran distinta forma serían dos señales que el usuario tendría que aprender por
    // separado. Con la misma, el ciclo entero habla un solo vocabulario: «esto se está yendo».
    expect(EXIT_STAIR_ONSETS_MS.length).toBe(STAIR_ONSETS_MS.length);
    const forma = (o: readonly number[]) => o.map((v) => v - o[0]);
    expect(forma(EXIT_STAIR_ONSETS_MS)).toEqual(forma(STAIR_ONSETS_MS));
  });

  test("y asciende igual, de difuso a nítido", () => {
    expect(EXIT_STAIR_ONSETS_MS.map((_, i) => stairStyleAt(i))).toEqual(["soft", "light", "rigid"]);
  });
});
