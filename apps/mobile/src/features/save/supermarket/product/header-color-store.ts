import { useState } from "react";
import { useColorScheme } from "nativewind";
import { create } from "zustand";

import {
  dealNext,
  HEADER_CARDS,
  resolveSkin,
  type HeaderCard,
  type HeaderSkin,
} from "../header-palette";

// El MAZO del color de cabecera del detalle de producto.
//
// Vive en un store de módulo y no en la pantalla porque la condición que se pide —«que no se
// repita»— es una relación entre DOS llegadas, y la pantalla no sobrevive de una a otra. En estado
// local, cada producto barajaría de cero y el choque volvería.
//
// En memoria, como la canasta de comparación: al reabrir la app se empieza de nuevo, y eso está
// bien. Que el primer producto de hoy repita el color del último de ayer no lo nota nadie.

type HeaderColorState = {
  /** Las cartas que quedan del ciclo. Vacío = agotado, se rebaraja en el siguiente reparto. */
  remaining: HeaderCard[];
  /** La carta que se está viendo. Es lo que el repartidor tiene prohibido sacar otra vez. */
  current: HeaderCard | null;
  /** Reparte la siguiente y la deja como actual. Devuelve la carta para usarla en el acto. */
  deal: () => HeaderCard;
};

export const useHeaderColorStore = create<HeaderColorState>((set, get) => ({
  remaining: [...HEADER_CARDS],
  current: null,

  deal: () => {
    const { remaining, current } = get();
    const next = dealNext(remaining, current);
    set({ remaining: next.remaining, current: next.card });
    return next.card;
  },
}));

/**
 * El color de ESTA llegada. Reparte una carta cuando cambia `arrivalKey` y la conserva mientras no
 * cambie.
 *
 * ⭐ **La llave tiene que ser estable desde el PRIMER fotograma, y por eso NO es la del entrance.**
 * Aquélla arranca con el slug y se convierte en el `canonical_product_id` cuando responde la
 * comparación (ver `entranceKeyOf`), así que repartiría DOS cartas por llegada y el usuario vería
 * la cabecera cambiar de color a mitad de carga. El slug ya viene en los parámetros de ruta.
 *
 * ⭐ Se reparte DURANTE el render y no en un efecto, a propósito: un efecto corre después de
 * pintar, así que el primer fotograma saldría con el color del producto ANTERIOR. Es el patrón que
 * React documenta para ajustar estado cuando cambia una prop —comparar y `set` en el render, sin
 * mutar refs— y aquí es seguro porque lo peor que hace un render descartado es adelantar el mazo
 * una carta: nunca produce un repetido.
 */
export function useHeaderColorFor(arrivalKey: string): HeaderSkin {
  const deal = useHeaderColorStore((s) => s.deal);
  const { colorScheme } = useColorScheme();
  const [dealt, setDealt] = useState(() => ({ key: arrivalKey, card: deal() }));

  if (dealt.key !== arrivalKey) {
    setDealt({ key: arrivalKey, card: deal() });
  }

  // ⭐ La carta se guarda SIN resolver y se voltea al leerla. Guardarla ya resuelta la dejaría
  // clavada en el tema que hubiera al repartirla: cambiar a oscuro con la pantalla abierta no la
  // voltearía, y la cabecera se quedaría clara sobre una app oscura hasta salir y volver a entrar.
  return resolveSkin(dealt.card, colorScheme === "dark");
}
