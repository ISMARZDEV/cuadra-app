import { t } from "@/i18n";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

import { useDraftCompletions, useProductTypeahead } from "./api";
import { useSuggestions } from "./use-suggestions";

/** Una píldora del carrusel, venga del catálogo estático o del typeahead. */
export interface Suggestion {
  /** Identidad de render (clave de lista). Cambia con el producto. */
  id: string;
  /** El texto que se ve y que se envía al chat. */
  label: string;
  /** Lo que cuenta el historial de popularidad. Ver `buildProductSuggestions`. */
  usageKey: string;
}

// Las tres formas de preguntar por un producto. Son plantillas i18n con un hueco `{product}`.
//
// ⚠️ NINGUNA puede exigir que `{product}` concuerde en género/número (es/pt) — el nombre es un
// string arbitrario del catálogo, no algo que el template pueda anticipar. `whereCheapest` decía
// "¿Dónde están LOS {product} MÁS BARATOS?" y sonaba bien con "Guandules Verdes Goya" (masculino
// plural, por casualidad) pero salía roto con "Crema Coco La Famosa" (femenino singular): "¿Dónde
// están los Crema Coco... más baratos?". Arreglado ligando el artículo/adjetivo a un sustantivo
// FIJO ("el mejor precio de {product}") en vez de al producto — así ninguna concordancia depende
// de un nombre que no controlamos. Inglés nunca tuvo el problema (sin género gramatical).
const PRODUCT_TEMPLATES = [
  "chat.suggest.whereCheapest",
  "chat.suggest.howMuch",
  "chat.suggest.compare",
] as const;

/** Menos de esto matchea medio catálogo y la sugerencia no discrimina nada. */
const MIN_QUERY = 3;

/** Mínimo del BORRADOR ENTERO antes de gastar una llamada al modelo. Coincide en número con
 *  `MIN_QUERY` pero mide otra cosa: aquél es la palabra que se está tipeando, éste es la frase. */
const MIN_DRAFT = 3;

/** Cuánto tiene que quedarse quieto el teclado antes de preguntarle al catálogo. */
const DEBOUNCE_MS = 300;

/**
 * Y cuánto antes de preguntarle al MODELO. Es más del doble a propósito: el catálogo es gratis y
 * puede permitirse la pausa de quien piensa la palabra siguiente; una llamada al LLM cuesta, así
 * que sólo se hace cuando el usuario de verdad se detuvo.
 */
const LLM_DEBOUNCE_MS = 700;

/** Toda sugerencia generada cuenta bajo UNA clave: lo que se aprende es «acepta lo que le
 *  completan», no cada frase suelta que el modelo inventó una vez. */
const COMPLETION_KEY = "chat.suggest.completion";

/**
 * El fragmento que se le manda al catálogo: la ÚLTIMA PALABRA, en minúsculas.
 *
 * No es un atajo, es lo que exige el backend. `word_similarity(query, name)` mide el mejor calce
 * del conjunto COMPLETO de trigramas de la query contra un tramo CONTIGUO del nombre; mandarle
 * «Donde estan los guan» contra «Guandules Verdes Goya» puntúa casi cero, porque las palabras de
 * relleno no aparecen en el nombre del producto y arrastran el puntaje al piso. Con «guan» suelto,
 * calza de sobra.
 *
 * Limitación conocida: un producto de dos palabras («arroz blanco») se busca por la última. Es
 * suficiente para el catálogo actual; si deja de serlo, el arreglo es probar las dos últimas
 * palabras y quedarse con el mejor puntaje — NO bajar el piso de similitud.
 */
export function typeaheadQuery(draft: string): string {
  const last = draft.trim().split(/\s+/).pop() ?? "";
  return last.length >= MIN_QUERY ? last.toLowerCase() : "";
}

/**
 * Las tres preguntas posibles sobre un producto concreto.
 *
 * `usageKey` es la PLANTILLA, no el producto: «¿cuánto cuesta X?» es el mismo hábito sin importar
 * si X fue arroz o guandules. Contar por producto daría un historial con un uso por cada cosa que
 * el usuario buscó una vez en su vida, y nunca ascendería nada.
 */
export function buildProductSuggestions(product: string): Suggestion[] {
  return PRODUCT_TEMPLATES.map((key) => ({
    id: `${key}:${product}`,
    label: t(key, { product }),
    usageKey: key,
  }));
}

/**
 * Las sugerencias que ve el usuario ahora mismo.
 *
 * Cascada: si el catálogo reconoce lo que se está escribiendo, manda el producto; si no —porque no
 * se escribió nada, o porque «cuánto gasté este mes» sencillamente NO es un producto—, se cae al
 * catálogo estático ordenado por historial. Nunca se queda vacío.
 */
export function useLiveSuggestions(draft: string): {
  items: Suggestion[];
  isResolving: boolean;
  /** El producto del catálogo que se reconoció en lo que se está escribiendo, si hubo alguno.
   *  Se expone aparte de `items` porque la UI lo ANUNCIA por su cuenta (encabezado con shimmer
   *  sobre el carrusel): las sugerencias dicen qué se puede preguntar, esto dice sobre QUÉ. */
  product?: string;
  /** Rehace la baraja del catálogo estático. Se llama tras cada envío. */
  reshuffle: () => void;
} {
  const { keys, reshuffle } = useSuggestions();

  // T1 — el catálogo. Gratis, así que arranca con la pausa corta.
  const query = typeaheadQuery(useDebouncedValue(draft, DEBOUNCE_MS));
  const { data, isFetching } = useProductTypeahead(query);
  const product = query.length > 0 ? data?.[0]?.name : undefined;

  // T2 — el modelo. Se le pregunta SÓLO si el catálogo ya respondió y no supo: mientras T1 siga en
  // vuelo no se dispara, o se pagarían tokens por algo que estaba por llegar gratis. Pasar `""` es
  // lo que desactiva la consulta (ver `useDraftCompletions`).
  // Arranca en `""` EXPLÍCITO: montar con texto ya escrito (abrir el dock después de tipear) no es
  // evidencia de que el usuario se haya detenido, y sin esto la primera llamada al modelo saldría
  // sin un solo milisegundo de espera.
  const slowDraft = useDebouncedValue(draft.trim(), LLM_DEBOUNCE_MS, "");
  const needsModel = !product && !isFetching && slowDraft.length >= MIN_DRAFT;
  const { data: completions, isFetching: modelFetching } = useDraftCompletions(
    needsModel ? slowDraft : "",
  );

  let items: Suggestion[];
  if (product) {
    items = buildProductSuggestions(product);
  } else if (completions?.length) {
    items = completions.map((label, i) => ({
      id: `${COMPLETION_KEY}:${i}:${label}`,
      label,
      usageKey: COMPLETION_KEY,
    }));
  } else {
    items = keys.map((key) => ({ id: key, label: t(key), usageKey: key }));
  }

  // Sólo se anuncia trabajo cuando de verdad hay algo en vuelo. Un shimmer sobre una operación que
  // ya terminó es una mentira visual.
  const isResolving = (query.length > 0 && isFetching) || (needsModel && modelFetching);
  return { items, isResolving, product, reshuffle };
}
