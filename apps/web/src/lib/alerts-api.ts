import {
  alertNotifications,
  listAlerts,
  subscribeAlert,
  unsubscribeAlert,
} from "@cuadra/api-client";

import { apiClient } from "./api";
import { authHeaders } from "./use-auth";

// Llamadas autenticadas de alertas (G4): inyectan el header Bearer del usuario. Todas client-side.
export const subscribe = (productId: string, thresholdMinor?: number | null) =>
  subscribeAlert({
    client: apiClient,
    headers: authHeaders(),
    body: { product_id: productId, threshold_minor: thresholdMinor ?? null },
  });

export const myAlerts = () => listAlerts({ client: apiClient, headers: authHeaders() });

export const removeAlert = (alertId: string) =>
  unsubscribeAlert({ client: apiClient, headers: authHeaders(), path: { alert_id: alertId } });

export const myNotifications = () =>
  alertNotifications({ client: apiClient, headers: authHeaders() });
