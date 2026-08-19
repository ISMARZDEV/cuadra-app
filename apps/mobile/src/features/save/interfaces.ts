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
  /**
   * Cómo se PARTE el título en el card, una entrada por línea. Es dato, no cálculo: el diseño
   * corta «Supermarket» en «Super / market», y ningún algoritmo de wrap adivina eso — dejado al
   * ajuste automático, RN parte por donde entra y escupe «Supermar / ket», que es lo que se veía.
   * `title` sigue siendo la marca entera para accesibilidad y para la hoja de «en construcción».
   */
  titleLines: readonly string[];
  blurbKey: TranslationKey;
  status: VerticalStatus;
  href?: Href; // solo cuando status === "live"
  /**
   * La ilustración del panel. Va como PNG (@3x de los 133pt del diseño), no como SVG: los dos
   * emblemas son mapas de bits envueltos en `<svg>` —máscara y filtro incluidos—, y por esa vía
   * pesaban 1.4 MB DENTRO del bundle de JS y el de Supermarket ni siquiera componía igual.
   * Como asset, Metro los sirve aparte y el render es el del diseño.
   *
   * Es obligatoria: `check-emblem` es el emblema genérico de marca para las verticales que todavía
   * no tienen ilustración propia, así que ninguna queda pelada.
   */
  art: ImageSourcePropType;
  featured?: boolean; // la estrella rellena del diseño
}

export interface VerticalCardProps {
  vertical: Vertical;
  onPress: (vertical: Vertical) => void;
}
