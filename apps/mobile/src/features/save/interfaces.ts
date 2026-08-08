import type { AlertDto, AlertNotificationDto } from "@cuadra/api-client";
import type { Href } from "expo-router";
import type { ImageSourcePropType } from "react-native";

import type { TranslationKey } from "@/i18n";

import type { VerticalId, VerticalStatus } from "./types";

export interface NotificationCardProps {
  notification: AlertNotificationDto;
}

export interface SubscriptionRowProps {
  alert: AlertDto;
  onRemove: (alertId: string) => void;
}

// --- Hub de verticales -------------------------------------------------------------------------

export interface Vertical {
  id: VerticalId;
  // El título es de MARCA: va igual en los tres idiomas (así está en el diseño). Lo que SÍ se
  // traduce es la promesa de la hoja de «en construcción» — ver `blurbKey`.
  title: string;
  blurbKey: TranslationKey;
  status: VerticalStatus;
  href?: Href; // solo cuando status === "live"
  art?: ImageSourcePropType; // la ilustración del panel; sin ella el panel queda solo con su trazo
  featured?: boolean; // la estrella rellena del diseño
}

export interface VerticalCardProps {
  vertical: Vertical;
  onPress: (vertical: Vertical) => void;
}
