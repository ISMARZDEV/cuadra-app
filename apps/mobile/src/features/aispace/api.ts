import { postSuggest, searchProducts } from "@cuadra/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getLanguage } from "@/i18n";

// Typeahead del chat sobre el catálogo de Save. Primer uso de `searchProducts` en el móvil: el
// hook estaba generado en el SDK desde siempre, pero sólo lo consumía la web.
//
// Es la MISMA llamada que hace la tool `search_groceries` del GroceriesAgent — sólo que invocada
// directo desde el cliente en vez de detrás de un turno completo del LLM. Por eso resolver
// «guan» → «guandules» cuesta CERO tokens: del lado del servidor es pg_trgm (`word_similarity`,
// piso 0.35) fusionado por RRF con pgvector.
//
// ⚠️ Este archivo ESTRENA dos patrones que no existían en el repo: todos los `useQuery` de hoy son
// fetch-on-mount con `refetchInterval` (features/save/api.ts, features/insights/api.ts), sin un
// solo `enabled` ni `placeholderData`. Si buscás un precedente para copiar, no lo hay: es este.

/** Sin `market`: el backend ya resuelve su default. Fijarlo acá sería una segunda fuente de verdad. */
export const TYPEAHEAD_KEY = (q: string) => ["aispace", "typeahead", q] as const;

// El catálogo no cambia entre pulsaciones. Cachear evita re-pedir lo mismo al borrar una letra y
// volver a escribirla, que es un gesto MUY común mientras se tipea.
const TYPEAHEAD_STALE_MS = 5 * 60_000;

/**
 * Candidatos del catálogo para el fragmento que se está escribiendo.
 *
 * `query` viene ya normalizado por `typeaheadQuery` (última palabra, minúsculas, ≥3 caracteres);
 * la cadena vacía significa «no hay nada que buscar» y desactiva la consulta.
 */
export function useProductTypeahead(query: string) {
  return useQuery({
    queryKey: TYPEAHEAD_KEY(query),
    queryFn: () => searchProducts({ query: { q: query } }).then((r) => r.data ?? []),
    // Nada de pedirle al servidor un fragmento de dos letras: matchea medio catálogo y el
    // resultado no sirve para sugerir.
    enabled: query.length > 0,
    // Sin esto, cada tecla vacía la lista antes de traer la nueva y las píldoras PARPADEAN entre
    // resultado y estático. Con `keepPreviousData` se mantiene lo último bueno mientras llega.
    placeholderData: keepPreviousData,
    staleTime: TYPEAHEAD_STALE_MS,
  });
}

// ── T2 · el nivel que CUESTA ────────────────────────────────────────────────────────────────────
export const COMPLETIONS_KEY = (draft: string) => ["aispace", "completions", draft] as const;

// Más largo que el del catálogo: una respuesta del modelo para el mismo borrador no cambia, y cada
// acierto de caché es una llamada que no se paga.
const COMPLETIONS_STALE_MS = 30 * 60_000;

/**
 * Completa el borrador con un LLM. **Sólo se llama cuando el catálogo no supo responder** — quien
 * decide eso es `use-live-suggestions`, pasando `""` para desactivar la consulta.
 *
 * El precio de este nivel es real (tokens por llamada), así que todo acá está puesto para llamarlo
 * lo menos posible: la cascada lo saltea si T1 acertó, el debounce es más largo, y la caché de 30
 * minutos cubre volver a escribir el mismo texto.
 */
export function useDraftCompletions(draft: string) {
  return useQuery({
    queryKey: COMPLETIONS_KEY(draft),
    queryFn: () =>
      postSuggest({ body: { draft, locale: getLanguage() } }).then((r) => r.data?.suggestions ?? []),
    enabled: draft.length > 0,
    placeholderData: keepPreviousData,
    staleTime: COMPLETIONS_STALE_MS,
  });
}
