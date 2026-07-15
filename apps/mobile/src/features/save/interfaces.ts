import type { AlertDto, AlertNotificationDto } from "@cuadra/api-client";

export interface NotificationCardProps {
  notification: AlertNotificationDto;
}

export interface SubscriptionRowProps {
  alert: AlertDto;
  onRemove: (alertId: string) => void;
}
