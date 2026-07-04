import { alertNotifications, listAlerts, unsubscribeAlert } from "@cuadra/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Query/mutation hooks de alertas de precio (G4) sobre el SDK generado (cuadra-mobile §3).
// El Bearer lo inyecta el interceptor de lib/api/client.ts. El feed es el MISMO que ve la web:
// las alertas son server-side por user_id → se comparten entre app y web.

export const ALERT_NOTIFICATIONS_KEY = ["save", "alertNotifications"] as const;
export function useAlertNotifications() {
  return useQuery({
    queryKey: ALERT_NOTIFICATIONS_KEY,
    queryFn: () => alertNotifications().then((r) => r.data ?? []),
  });
}

export const MY_ALERTS_KEY = ["save", "alerts"] as const;
export function useMyAlerts() {
  return useQuery({
    queryKey: MY_ALERTS_KEY,
    queryFn: () => listAlerts().then((r) => r.data ?? []),
  });
}

export function useUnsubscribeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => unsubscribeAlert({ path: { alert_id: alertId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_ALERTS_KEY }),
  });
}
