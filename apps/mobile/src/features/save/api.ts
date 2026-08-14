import {
  alertNotifications,
  featuredProducts,
  listAlerts,
  subscribeAlert,
  todaysDeals,
  unsubscribeAlert,
} from "@cuadra/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
/** «Mejores ofertas de hoy»: productos con bajada reciente, mayor % primero. */
export function useTodaysDeals(limit: number = RAIL_LIMIT) {
  return useQuery({
    queryKey: [...TODAYS_DEALS_KEY, limit],
    queryFn: () => todaysDeals({ query: { limit } }).then((r) => r.data ?? []),
  });
}

export const FEATURED_PRODUCTS_KEY = ["save", "featured"] as const;
/** «Productos»: el rail general de la home. `popular` = disponible en más tiendas, que para un
 *  comparador es el proxy honesto de relevancia — no hay señal de ventas. */
export function useFeaturedProducts(sort = "popular", limit: number = RAIL_LIMIT) {
  return useQuery({
    queryKey: [...FEATURED_PRODUCTS_KEY, sort, limit],
    queryFn: () => featuredProducts({ query: { sort, limit } }).then((r) => r.data ?? []),
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
