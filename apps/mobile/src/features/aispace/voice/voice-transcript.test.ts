import { describe, expect, test } from "vitest";
import { easingNameOf } from "@/test/reanimated-stub";
import { LENS_MOTION } from "@/components/ui/liquid-focus/use-liquid-focus";

import { SHIMMER_CYCLES, SHIMMER_TIMING, TEXT_EXIT_MS, TEXT_HOLD_MS } from "./voice-transcript";

describe("los tiempos del dictado en pantalla", () => {
  /**
   * ⭐⭐⭐ **EL RELOJ DEL BARRIDO VA LINEAL, y esto es lo único que puede vigilarlo.**
   *
   * El escalonado del shimmer vive en la VENTANA de cada letra (`text-shimmer`), no en el reloj. Con
   * una curva aquí, el desfase que percibe el usuario —que está en MILISEGUNDOS— se aplasta: las
   * letras del medio se amontonan y el frente deja de leerse como algo que viaja. Es exactamente lo
   * que le pasó a la cascada del detalle de producto durante una fase entera con 480 tests en verde,
   * porque el arnés no distinguía una curva de otra. Ahora sí: `cuadra-motion` §7a.
   */
  test("el reloj del barrido es LINEAL —una curva aplastaría el escalonado", () => {
    expect(easingNameOf(SHIMMER_TIMING.easing)).toBe("linear");
  });

  test("el periodo se DERIVA de cuántas veces debe cruzar el brillo", () => {
    // Escribir el periodo suelto es lo que descuadra un barrido cuando alguien toca la espera: los
    // dos números dejan de tener nada que ver y nadie se entera hasta que se mira muy fijo.
    expect(SHIMMER_TIMING.duration * SHIMMER_CYCLES).toBe(TEXT_HOLD_MS);
  });

  test("la frase se LEE mucho más de lo que tarda en irse", () => {
    // El reparto ES el efecto: dos segundos para leer, un cierre corto para enviar. Si la salida se
    // acercara a la espera, el final dejaría de ser un punto y pasaría a ser otra animación.
    expect(TEXT_HOLD_MS).toBeGreaterThan(TEXT_EXIT_MS * 4);
  });

  test("caben barridos ENTEROS en la espera —ninguno se corta a mitad", () => {
    // Un barrido cortado a medias deja la frase con el brillo parado en un punto cualquiera justo
    // antes de desvanecerse: se lee como que algo se colgó.
    expect(Number.isInteger(SHIMMER_CYCLES)).toBe(true);
    expect(SHIMMER_CYCLES).toBeGreaterThanOrEqual(2);
  });
});

describe("texto y cúpula se van JUNTOS", () => {
  /**
   * ⭐⭐ **Las dos salidas ARRANCAN a la vez pero no DURAN lo mismo, y ahí está el invariante.**
   *
   * El usuario lo pidió así: «cuando termina y sale el texto, al mismo tiempo sale de la cúpula».
   * Arrancan juntas al cumplirse `TEXT_HOLD_MS`. Pero la frase tarda 300 ms y la onda radial que
   * borra la cúpula, 900. Quien decide cuándo se puede navegar es la ÚLTIMA en terminar — y navegar
   * antes deja el salto al chat ocurriendo con la cúpula a media retirada.
   *
   * Si alguien acorta la cúpula o alarga el desvanecido hasta invertir esta relación, el cálculo del
   * envío en `orb-liquid-focus` pasa a temporizar contra la equivocada sin que nada se queje.
   */
  test("la CÚPULA es la lenta: es ella quien manda cuándo se puede navegar", () => {
    expect(LENS_MOTION.releaseMs).toBeGreaterThan(TEXT_EXIT_MS);
  });
});
