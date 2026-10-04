import { useEffect } from "react";

import { orbStairStep } from "@/lib/haptics/orb-haptics";

import { stairStyleAt } from "./send-stairs";

/**
 * UNA ESCALERA EN EL DEDO — tres peldaños que ascienden, colgados de un instante.
 *
 * Se usa DOS veces en el ciclo del dictado y con offsets distintos, que es la razón de que reciba
 * los suyos en vez de traerlos dentro: con el SONIDO del envío se pega a los ataques medidos del
 * clip; con la SALIDA de la cúpula arranca en cero, porque ahí lo que hay que acompañar es un
 * movimiento y un movimiento empieza cuando empieza.
 *
 * ⭐⭐⭐ **Se arma con la MISMA señal que dispara el audio** (`phase === "answering"`), y ése es todo
 * el truco: los dos cuelgan del mismo instante, así que los offsets medidos del clip valen tal cual
 * como retardos. Colgándolo de cualquier otra cosa habría que estimar la diferencia entre los dos
 * arranques, y una escalera háptica desplazada 80 ms del sonido no se percibe como el sonido
 * teniendo cuerpo: se percibe como un eco.
 *
 * ⚠️ El audio de `expo-audio` arranca tras un `seekTo` asíncrono, así que puede entrar unos
 * milisegundos después que los temporizadores. Es la desviación que queda; el player está precargado
 * y «caliente» (`keepAudioSessionActive`) justamente para que sea pequeña.
 */
export function useHapticStairs(armed: boolean, onsets: readonly number[]): void {
  useEffect(() => {
    if (!armed) return;

    const pending = onsets.map((at, i) => setTimeout(() => orbStairStep(stairStyleAt(i)), at));

    // ⚠️ Si el ciclo muere a mitad —un gesto nuevo, el orbe que se oculta— la escalera muere con él:
    // media escalera sin su sonido es una vibración suelta que nadie sabe atribuir.
    return () => pending.forEach(clearTimeout);
  }, [armed, onsets]);
}
