import { useCallback, useState } from "react";

import { useSuggestionUsageStore } from "@/store/suggestion-usage-store";

// El catálogo de sugerencias del dock. Vive acá y no en `quick-actions.tsx` porque el componente
// ya no decide QUÉ mostrar — sólo lo pinta. Prompts estáticos desde i18n; el typeahead en vivo
// (tanda 2) los reemplazará por sugerencias derivadas de lo que el usuario está escribiendo.
export const QUICK_ACTION_KEYS = [
  "chat.quickActions.spentThisMonth",
  "chat.quickActions.registerIncome",
  "chat.quickActions.availableMoney",
  "chat.quickActions.shoppingList",
  "chat.quickActions.budgetStatus",
  "chat.quickActions.biggestExpense",
  "chat.quickActions.compareProduct",
  "chat.quickActions.savingTip",
] as const;

/** La clave i18n de una sugerencia. Genérica en el catálogo para que `t()` siga viendo el tipo
 *  literal: si esto degradara a `string`, `t()` dejaría de validar las claves en compilación. */
export type SuggestionKey = (typeof QUICK_ACTION_KEYS)[number];

/** Cuántas sugerencias del historial se promueven al frente. */
const PROMOTED = 3;

// Fisher-Yates con el `random` INYECTADO. Se inyecta por la misma razón que en
// `use-status-sequence.ts`: para poder clavarlo en los tests. Un barajado que no se puede fijar no
// se puede testear, y uno que no se testea termina perdiendo o duplicando elementos en silencio.
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Las 3 más enviadas al frente, el resto barajado.
 *
 * Pura a propósito: el orden es la regla de negocio de esta feature y se prueba sin montar nada.
 * El hook de abajo sólo decide CUÁNDO volver a llamarla.
 */
export function orderSuggestions<T extends string>(
  all: readonly T[],
  usage: Record<string, number>,
  random: () => number,
): T[] {
  // `filter` contra el catálogo, no `Object.keys(usage)` a secas: una sugerencia retirada puede
  // seguir viva en el historial persistido de un usuario viejo, y no debe reaparecer.
  const promoted = all
    .filter((key) => (usage[key] ?? 0) > 0)
    .sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0))
    .slice(0, PROMOTED);

  const rest = all.filter((key) => !promoted.includes(key));
  return [...promoted, ...shuffle(rest, random)];
}

/**
 * El orden que ve el usuario, estable dentro de una tanda.
 *
 * La baraja se decide UNA vez por tanda y NO en cada render — misma doctrina que
 * `use-status-sequence.ts` («o la palabra saltaría sola entre frames»); acá lo que saltaría son
 * las píldoras bajo el dedo. Tanda nueva = al montar (abrir el dock) y en cada `reshuffle()`.
 */
export function useSuggestions(random: () => number = Math.random) {
  const usage = useSuggestionUsageStore((s) => s.usage);
  const [keys, setKeys] = useState(() => orderSuggestions(QUICK_ACTION_KEYS, usage, random));

  const reshuffle = useCallback(() => {
    // Se lee el contador FRESCO del store, no el del render: `reshuffle` corre justo después de
    // registrar un envío, y con la copia del closure esa sugerencia recién usada no ascendería
    // hasta la tanda siguiente.
    setKeys(orderSuggestions(QUICK_ACTION_KEYS, useSuggestionUsageStore.getState().usage, random));
  }, [random]);

  return { keys, reshuffle };
}
