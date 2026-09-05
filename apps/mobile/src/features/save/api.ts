import {
  alertNotifications,
  brandProducts,
  categoryProducts,
  compareProduct,
  featuredProducts,
  listAlerts,
  listCategories,
  priceHistory,
  productStores,
  searchProductCards,
  searchProducts,
  similarProducts,
  subscribeAlert,
  listProductGroups,
  createProductGroup,
  addProductToGroup,
  removeProductFromGroup,
  deleteProductGroup,
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


// ── Detalle de producto ────────────────────────────────────────────────────────────────────────
//
// ⭐ HAY UN WATERFALL OBLIGATORIO y no es negociable: el producto se resuelve por SLUG (llave
// pública, SEO), pero el historial y las listas hermanas se piden por `canonical_product_id`, que
// sólo se conoce DESPUÉS de que responda la comparación. Lanzar las cuatro a la vez deja tres
// pidiendo `undefined`. Por eso las tres dependientes van con `enabled` contra el id.
//
// La web hace exactamente esto en su `+data.ts`; acá se replica con `enabled` porque no hay SSR.

/** Una comparación se pide muchas veces (volver atrás, cambiar de pestaña) y el precio no cambia
 *  en segundos. Un minuto evita el parpadeo de recarga sin llegar a servir un precio rancio. */
const DETAIL_STALE_MS = 60_000;

export const PRODUCT_KEY = (slug: string) => ["save", "product", slug] as const;
/** El detalle: identidad, precio mínimo, migas y las tiendas con su sobreprecio. */
export function useProductComparison(slug: string) {
  return useQuery({
    queryKey: PRODUCT_KEY(slug),
    queryFn: () => compareProduct({ query: { slug } }).then((r) => r.data),
    staleTime: DETAIL_STALE_MS,
    enabled: slug.length > 0,
  });
}

export const PRODUCT_STORES_KEY = (slug: string) => ["save", "productStores", slug] as const;
/** El panel «Otras tiendas»: logo, precio anterior, tipo de precio y cuándo se vio.
 *
 *  Va por SLUG, así que NO espera al waterfall — puede volar junto con la comparación. Es el
 *  gemelo público del panel del admin y lee su misma consulta. */
export function useProductStores(slug: string) {
  return useQuery({
    queryKey: PRODUCT_STORES_KEY(slug),
    queryFn: () => productStores({ path: { slug } }).then((r) => r.data ?? []),
    staleTime: DETAIL_STALE_MS,
    enabled: slug.length > 0,
  });
}

export const PRICE_HISTORY_KEY = (id: string) => ["save", "priceHistory", id] as const;
/** El histórico. Los puntos son CHANGE-ONLY: cada uno rige hasta el siguiente, así que el chart
 *  es de ESCALONES. Interpolar dibujaría precios que nunca existieron. */
export function usePriceHistory(productId: string | undefined) {
  return useQuery({
    queryKey: PRICE_HISTORY_KEY(productId ?? ""),
    queryFn: () =>
      priceHistory({ query: { product_id: productId!, range: "all" } }).then((r) => r.data),
    staleTime: DETAIL_STALE_MS,
    enabled: Boolean(productId),
  });
}

export const SIMILAR_PRODUCTS_KEY = (id: string) => ["save", "similar", id] as const;
/** Alternativas: los hermanos en la taxonomía, más barato POR UNIDAD primero. */
export function useSimilarProducts(productId: string | undefined) {
  return useQuery({
    queryKey: SIMILAR_PRODUCTS_KEY(productId ?? ""),
    queryFn: () =>
      similarProducts({ path: { product_id: productId! }, query: { limit: 12 } }).then(
        (r) => r.data ?? [],
      ),
    staleTime: DETAIL_STALE_MS,
    enabled: Boolean(productId),
  });
}

export const BRAND_PRODUCTS_KEY = (id: string) => ["save", "brand", id] as const;
/** «Más de la marca». Pregunta distinta de la de arriba: aquélla es ahorro, ésta es fidelidad. */
export function useBrandProducts(productId: string | undefined) {
  return useQuery({
    queryKey: BRAND_PRODUCTS_KEY(productId ?? ""),
    queryFn: () =>
      brandProducts({ path: { product_id: productId! }, query: { limit: 12 } }).then(
        (r) => r.data ?? [],
      ),
    staleTime: DETAIL_STALE_MS,
    enabled: Boolean(productId),
  });
}


// ── Grupos de productos ────────────────────────────────────────────────────────────────────────
//
// Las carpetas que el usuario arma desde el detalle. El listado se pide SIEMPRE con el producto
// delante (`product_id`) porque la hoja necesita dos cosas a la vez: qué grupos hay y en cuáles
// está ESTE producto — y el backend resuelve la pertenencia en la misma llamada.

/** La llave lleva el producto: dos productos distintos NO comparten la respuesta, porque `contains`
 *  cambia entre ellos. Con una llave sin producto, abrir la hoja en el segundo mostraría las
 *  palomitas del primero hasta que revalidara. */
export const MY_GROUPS_KEY = ["save", "groups"] as const;

export function useMyGroups(productId?: string) {
  return useQuery({
    queryKey: [...MY_GROUPS_KEY, productId ?? null],
    queryFn: () =>
      listProductGroups({ query: productId ? { product_id: productId } : {} }).then(
        (r) => r.data ?? [],
      ),
    // Sin producto todavía no hay pertenencia que pintar, y la hoja no se puede abrir: pedirlo
    // sería gastar una consulta para tirarla.
    enabled: productId != null,
  });
}

/** Invalida TODOS los listados de grupos, no sólo el del producto actual: crear o borrar un grupo
 *  cambia la lista que ve cualquier otro producto. */
function useGroupsInvalidator() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: MY_GROUPS_KEY });
}

export function useCreateGroup() {
  const invalidate = useGroupsInvalidator();
  return useMutation({
    mutationFn: (vars: { name: string; productId?: string }) =>
      createProductGroup({ body: { name: vars.name, product_id: vars.productId ?? null } }),
    onSuccess: invalidate,
  });
}

export function useAddToGroup() {
  const invalidate = useGroupsInvalidator();
  return useMutation({
    mutationFn: (vars: { groupId: string; productId: string }) =>
      addProductToGroup({
        path: { group_id: vars.groupId },
        body: { product_id: vars.productId },
      }),
    onSuccess: invalidate,
  });
}

export function useRemoveFromGroup() {
  const invalidate = useGroupsInvalidator();
  return useMutation({
    mutationFn: (vars: { groupId: string; productId: string }) =>
      removeProductFromGroup({
        path: { group_id: vars.groupId, product_id: vars.productId },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useGroupsInvalidator();
  return useMutation({
    mutationFn: (groupId: string) => deleteProductGroup({ path: { group_id: groupId } }),
    onSuccess: invalidate,
  });
}
