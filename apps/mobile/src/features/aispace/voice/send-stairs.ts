/**
 * LA ESCALERA DEL ENVÍO — el mismo suceso, en el oído y en el dedo.
 *
 * ⭐⭐⭐ **Los tiempos están MEDIDOS del clip, no elegidos.** Salen de analizar
 * `send-messages-01-loud.wav` con ventanas de 5 ms (`sox <f> -n trim <t> 0.005 stat`), que es la
 * resolución a la que los ataques se separan; con ventanas de 20 ms dos de ellos se fundían y la
 * escalera parecía tener tres peldaños en vez de cuatro.
 *
 * | golpe | ataque  | pico  | tono    |
 * |-------|---------|-------|---------|
 * | 1     | 0.200 s | 0.711 | 258 Hz  |
 * | 2     | 0.250 s | 0.702 | 388 Hz  |
 * | 3     | 0.300 s | 0.788 | 528 Hz  |
 * | 4     | 0.400 s | 0.891 | 786 Hz  |
 *
 * ⭐⭐ **La escalera SUBE.** Cada peldaño es ~1,5× el tono del anterior —una quinta justa— y el pico
 * también crece. Se pidió «como esa escalera bajando», y lo que baja es el mensaje al irse: el
 * sonido asciende. El háptico sigue al AUDIO y no a la metáfora, porque cuando el oído y el dedo
 * discrepan gana el oído y la vibración se siente mal puesta.
 *
 * ⚠️⚠️ **Y NO PUEDEN SONAR LOS CUATRO.** Los huecos del clip son 50, 50 y 100 ms, y el Taptic Engine
 * no separa nada por debajo de ~100: pedirle los cuatro no da una escalera rápida, da un BORRÓN —los
 * pulsos se funden y encima se corre el riesgo de desbordar su cola, que descarta en silencio—. Se
 * toma el subconjunto MÁXIMO que el motor puede pronunciar, y son tres.
 */

/**
 * EL MÍNIMO QUE EL MOTOR SEPARA, en milisegundos.
 *
 * No es una preferencia de diseño: por debajo de esto el Taptic Engine funde dos toques en uno, así
 * que un patrón más apretado se siente como un zumbido por mucho que sobre el papel tuviera ritmo.
 * Y su cola interna se desborda con llamadas seguidas descartándolas EN SILENCIO.
 */
export const MIN_TAPTIC_GAP_MS = 100;

/** Los cuatro ataques REALES del clip, en milisegundos desde que empieza a sonar. */
export const AUDIO_ONSETS_MS = [200, 250, 300, 400] as const;

/**
 * LOS PELDAÑOS QUE SE TOCAN: el 1.º, el 3.º y el 4.º.
 *
 * ⚠️ Los huecos quedan en 100 ms exactos, o sea JUSTO en el límite del motor. Es una decisión
 * consciente y tiene alternativa: separarlos más obligaría a inventar tiempos y perder la
 * sincronía, que es lo único que hace que esto se sienta como el sonido y no como algo que lo
 * acompaña. Si en el dispositivo se percibe un solo golpe en vez de tres, el repliegue es quedarse
 * con el primero y el último (200 y 400 ms, 200 de hueco): dos peldaños seguros.
 */
export const STAIR_ONSETS_MS = [200, 300, 400] as const;

/** El carácter de cada peldaño, del más difuso al más nítido. Acompaña la subida de tono. */
export type StairStyle = "soft" | "light" | "rigid";

/**
 * QUÉ CARÁCTER LE TOCA AL PELDAÑO `index`.
 *
 * ⭐ `expo-haptics` no da intensidad ni «sharpness» variables —eso es Core Haptics—, así que la
 * subida se consigue cambiando de ESTILO: `Soft` es difuso y sin canto, `Light` ya se localiza, y
 * `Rigid` es el más nítido de la familia. Recorrerlos en ese orden es lo más parecido a subir de
 * 258 a 786 Hz que el motor puede decir sin un módulo nativo.
 */
export function stairStyleAt(index: number): StairStyle {
  const escala: StairStyle[] = ["soft", "light", "rigid"];
  return escala[Math.min(index, escala.length - 1)];
}

/**
 * LA MISMA ESCALERA, PERO EN LA SALIDA — cuando la cúpula se retira con la onda hacia arriba.
 *
 * ⭐⭐⭐ **Arranca en CERO y no en 200 ms, y ésa es la única diferencia con la del sonido.** Aquella
 * se ancla a los ataques del clip porque tiene un audio al que pegarse; ésta se ancla al MOVIMIENTO,
 * y el movimiento empieza cuando empieza. Copiar allí los offsets del audio metería 200 ms de
 * retraso contra nada: la onda ya estaría subiendo cuando llegara el primer peldaño.
 *
 * ⭐⭐ **Y sustituye al aviso de dos toques que había 180 ms antes.** No es una preferencia: el
 * último toque de aquel caía en 1950 ms y el primer peldaño de ésta en 2000 — **50 ms de hueco, por
 * debajo del mínimo del motor**. Se habrían fundido en un golpe sucio, y encima dos patrones
 * seguidos acercan la cadencia al punto en que la cola descarta. Ahora la salida tiene UNA señal, la
 * misma que el envío, y el ciclo entero se lee con el mismo vocabulario.
 *
 * Los huecos son 100 ms, igual que la otra: el máximo que el motor pronuncia sin fundir.
 */
export const EXIT_STAIR_ONSETS_MS = [0, 100, 200] as const;
