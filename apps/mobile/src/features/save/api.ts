import {
  alertNotifications,
  categoryProducts,
  featuredProducts,
  listAlerts,
  listCategories,
  searchProductCards,
  searchProducts,
  subscribeAlert,
  todaysDeals,
  unsubscribeAlert,
} from "@cuadra/api-client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Query/mutation hooks de alertas de precio (G4) sobre el SDK generado (cuadra-mobile §3).
// El Bearer lo inyecta el interceptor de lib/api/client.ts. El feed es el MISMO que ve la web:
// las alertas son server-side por user_id → se comparten entre app y web.

// Poll en foreground: refresca el feed con la app activa (TanStack pausa el refetch cuando la app
// va a background). Elimina el pull-to-refresh manual sin romper el límite de iOS.
const REFRESH_MS = 30_000;

export const ALERT_NOTIFICATIONS_KEY = ["save", "alertNotifications"] as const;
export function useAlertNotifications() {
  return useQuery({
    queryKey: ALERT_NOTIFICATIONS_KEY,
    queryFn: () => alertNotifications().then((r) => r.data ?? []),
    refetchInterval: REFRESH_MS,
  });
}

export const MY_ALERTS_KEY = ["save", "alerts"] as const;
export function useMyAlerts() {
  return useQuery({
    queryKey: MY_ALERTS_KEY,
    queryFn: () => listAlerts().then((r) => r.data ?? []),
    refetchInterval: REFRESH_MS,
  });
}

export function useUnsubscribeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => unsubscribeAlert({ path: { alert_id: alertId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_ALERTS_KEY }),
  });
}

// Seguir un producto DESDE LA APP ("Avísame cuando baje"). El backend es el mismo endpoint
// autenticado que usa la web → las alertas se comparten por user_id. Listo para cablear al botón
// cuando exista la pantalla de producto en el móvil (marketplace Save móvil, pendiente).
// ── Rails de la home de Supermarket ────────────────────────────────────────────────────────────
// Los dos endpoints YA existían y devuelven `ProductCardDto[]`; no hizo falta inventar ninguno.
// No llevan `refetchInterval`: un catálogo no cambia cada 30s como el feed de alertas, y encima
// son las dos consultas más caras de la pantalla.

const RAIL_LIMIT = 12;

export const TODAYS_DEALS_KEY = ["save", "todaysDeals"] as const;
/** «Mejores ofertas de hoy» para el RAIL de la home: una muestra, sin paginar. */
export function useTodaysDeals(limit: number = RAIL_LIMIT) {
  return useQuery({
    queryKey: [...TODAYS_DEALS_KEY, limit],
    queryFn: () => todaysDeals({ query: { limit } }).then((r) => r.data?.items ?? []),
  });
}

/** «Mejores ofertas de hoy» PAGINADAS, para la rejilla del «ver más». */
export function useTodaysDealsPaged() {
  return useInfiniteQuery({
    queryKey: [...TODAYS_DEALS_KEY, "paged"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      todaysDeals({ query: { limit: GRID_PAGE, offset: pageParam as number } }).then((r) => r.data),
    getNextPageParam: nextOffset,
  });
}

export const FEATURED_PRODUCTS_KEY = ["save", "featured"] as const;
/** «Productos»: el rail general de la home. `popular` = disponible en más tiendas, que para un
 *  comparador es el proxy honesto de relevancia — no hay señal de ventas. */
export function useFeaturedProducts(sort = "popular", limit: number = RAIL_LIMIT) {
  return useQuery({
    queryKey: [...FEATURED_PRODUCTS_KEY, sort, limit],
    queryFn: () => featuredProducts({ query: { sort, limit } }).then((r) => r.data?.items ?? []),
  });
}

/** El catálogo general PAGINADO, para la rejilla del «ver más». */
export function useFeaturedProductsPaged(sort = "popular") {
  return useInfiniteQuery({
    queryKey: [...FEATURED_PRODUCTS_KEY, "paged", sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      featuredProducts({ query: { sort, limit: GRID_PAGE, offset: pageParam as number } }).then(
        (r) => r.data,
      ),
    getNextPageParam: nextOffset,
  });
}

export const CATEGORIES_KEY = ["save", "categories"] as const;
/** El árbol de categorías. Alimenta las pestañas del «ver más».
 *
 *  `staleTime` largo: una taxonomía cambia con un despliegue, no durante una sesión, y volver a
 *  pedirla cada vez que se monta la pantalla es tráfico por nada. */
export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => listCategories().then((r) => r.data?.categories ?? []),
    staleTime: 30 * 60_000,
  });
}

/** Tamaño de página de la rejilla. 24 = 8 filas de 3, suficiente para que el scroll tenga recorrido
 *  sin traerse la categoría entera de golpe. */
export const GRID_PAGE = 24;

/**
 * El siguiente `offset` es CUÁNTOS LLEVAMOS, no `página × tamaño`: si el servidor devolviera una
 * página corta, multiplicar saltaría productos en silencio.
 *
 * Se para por `total` y no por «vino una página corta», porque lo segundo MIENTE en las ofertas:
 * el servidor descarta las bajadas cuyo producto ya no está en la oferta vigente, así que una
 * página puede venir corta sin ser la última.
 */
function nextOffset<T>(
  last: { total: number; items: T[] } | undefined,
  all: ({ items: T[] } | undefined)[],
): number | undefined {
  if (!last) return undefined;
  const loaded = all.reduce((n, page) => n + (page?.items.length ?? 0), 0);
  return loaded < last.total ? loaded : undefined;
}

export const SEARCH_CARDS_KEY = ["save", "searchCards"] as const;
/**
 * Buscar en el SERVIDOR, devolviendo tarjetas. Es lo que hace honesta a la caja de búsqueda desde
 * que la rejilla pagina: filtrar en memoria sólo miraba el bloque descargado, así que en un
 * catálogo grande enseñaba cuatro resultados como si fueran todos.
 *
 * `enabled` con un mínimo de 2 letras: con una sola, el ranking híbrido devuelve medio catálogo y
 * se paga una consulta léxica MÁS una de embeddings por cada tecla.
 */
export function useSearchProductCards(query: string) {
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: [...SEARCH_CARDS_KEY, q],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      searchProductCards({ query: { q, limit: GRID_PAGE, offset: pageParam as number } }).then(
        (r) => r.data,
      ),
    getNextPageParam: nextOffset,
    enabled: q.length >= 2,
  });
}

export const SEARCH_SUGGESTIONS_KEY = ["save", "searchSuggestions"] as const;
/**
 * Las SUGERENCIAS del buscador mientras se escribe. Endpoint `/save/search`, no `/save/search/cards`.
 *
 * ⚠️ LA ELECCIÓN DEL ENDPOINT ES LO IMPORTANTE ACÁ, y va al revés de lo que parece.
 *
 * `/search/cards` es más rico —trae precio e imagen— y encima es HÍBRIDO: cruza una consulta léxica
 * con una de embeddings. Suena mejor para sugerir, y es peor, por dos razones:
 *
 * 1. **Coste**: se paga una consulta léxica MÁS una de embeddings POR CADA TECLA. Un typeahead
 *    dispara diez veces lo que una búsqueda; eso es un orden de magnitud de trabajo por sugerencias
 *    que el usuario descarta al teclear la letra siguiente.
 * 2. **Precisión**: un prefijo NO TIENE SEMÁNTICA que embeber. «carre» no significa nada — es medio
 *    token. Los embeddings brillan con INTENCIÓN («algo para la gripe»), y sobre un prefijo
 *    devuelven vecinos arbitrarios. Para completar lo que se está tecleando, lo que gana es el
 *    emparejamiento léxico, que además es el barato.
 *
 * O sea: lo vectorial se queda donde rinde —la búsqueda de VERDAD, en la rejilla— y el typeahead
 * usa el endpoint ligero. No es una limitación que arrastramos: es el reparto correcto.
 *
 * `enabled` a partir de 2 letras, igual que la rejilla: con una sola, cualquier ranking devuelve
 * medio catálogo.
 */
export function useSearchSuggestions(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: [...SEARCH_SUGGESTIONS_KEY, q],
    queryFn: () => searchProducts({ query: { q } }).then((r) => r.data ?? []),
    enabled: q.length >= 2,
    // Lo tecleado se revisita constantemente —se borra una letra y se vuelve a poner—, así que la
    // respuesta anterior sigue siendo válida un rato. Sin esto, retroceder una letra vuelve a pegarle
    // al servidor por algo que se acaba de pedir.
    staleTime: 60_000,
    // Mantiene en pantalla las sugerencias de la tecla anterior mientras llega la siguiente. Sin
    // esto la lista PARPADEA a vacío en cada letra, que es exactamente lo que hace que un typeahead
    // se sienta roto.
    placeholderData: (previous) => previous,
  });
}

export const CATEGORY_PRODUCTS_KEY = ["save", "categoryProducts"] as const;
/** Productos de una categoría para la rejilla del «ver más».
 *
 *  `enabled`: sin slug no hay consulta. La pantalla arranca en la lista de ORIGEN (ofertas o
 *  destacados), donde todavía no hay categoría elegida — y una consulta a `/category/undefined`
 *  devolvería un 404 que no significa nada. */
export function useCategoryProducts(slug: string | null, limit: number = GRID_PAGE) {
  return useQuery({
    queryKey: [...CATEGORY_PRODUCTS_KEY, slug, limit],
    queryFn: () =>
      categoryProducts({ path: { slug: slug as string }, query: { limit } }).then((r) => r.data),
    enabled: slug != null,
  });
}

/**
 * Productos de una categoría PAGINADOS: trae `GRID_PAGE` y pide el siguiente bloque cuando el
 * usuario llega al final.
 *
 * Una categoría puede tener miles de productos y traerlos todos de golpe es pagar una espera larga
 * por algo que casi nadie va a mirar entero. `total` viene en la respuesta, así que se sabe cuándo
 * dejar de pedir sin adivinar por «vino una página corta».
 */
export function useCategoryProductsPaged(slug: string | null) {
  return useInfiniteQuery({
    queryKey: [...CATEGORY_PRODUCTS_KEY, "paged", slug],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      categoryProducts({
        path: { slug: slug as string },
        query: { limit: GRID_PAGE, offset: pageParam as number },
      }).then((r) => r.data),
    // `products` en vez de `items`: `CategoryListingDto` trae además breadcrumb y facetas, así que
    // su lista tiene otro nombre. Misma regla de parada — ver `nextOffset`.
    getNextPageParam: (last, all) => {
      if (!last) return undefined;
      const loaded = all.reduce((n, page) => n + (page?.products.length ?? 0), 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: slug != null,
  });
}

export function useSubscribeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { productId: string; thresholdMinor?: number | null }) =>
      subscribeAlert({
        body: { product_id: vars.productId, threshold_minor: vars.thresholdMinor ?? null },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_ALERTS_KEY }),
  });
}
