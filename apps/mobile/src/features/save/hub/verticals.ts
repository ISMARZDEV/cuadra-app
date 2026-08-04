import type { Href } from "expo-router";

import type { TranslationKey } from "@/i18n";

// Las verticales de Save. Es un REGISTRO, no cinco JSX: el hub renderiza este array, así que
// agregar una vertical el día que tenga datos es una fila y un asset, no una pantalla nueva.
//
// `Promotions` NO está, y no es un olvido: las promociones no tienen catálogo propio — son un
// atributo de las otras (la oferta del súper, el cashback de la tarjeta, la tasa promocional del
// préstamo). Viven como badge y filtro DENTRO de cada vertical. El diseño ya lo decía al no
// dibujarle un card, y por eso el badge de descuento vive en la tarjeta de producto.

// `live` = tiene catálogo y navega · `soon` = existe como promesa, abre su hoja de estado.
// No es decoración: es lo que decide si el card lleva a algún lado.
export type VerticalStatus = "live" | "soon";

export interface Vertical {
  id: "supermarket" | "cards" | "loans" | "investments";
  // El título es de MARCA y va igual en los tres idiomas (así está en el diseño). Lo que sí se
  // traduce es la promesa de la hoja de «en construcción» — ver `blurbKey`.
  title: string;
  blurbKey: TranslationKey;
  status: VerticalStatus;
  href?: Href; // solo cuando status === "live"
}

export const VERTICALS: readonly Vertical[] = [
  {
    id: "supermarket",
    title: "Supermarket",
    blurbKey: "save.hub.supermarket.blurb",
    status: "live",
    href: "/save/supermarket" as Href,
  },
  {
    id: "cards",
    title: "Credit Cards",
    blurbKey: "save.hub.cards.blurb",
    status: "soon",
  },
  {
    id: "loans",
    title: "Loans & Insurance",
    blurbKey: "save.hub.loans.blurb",
    status: "soon",
  },
  {
    id: "investments",
    title: "Investments",
    blurbKey: "save.hub.investments.blurb",
    status: "soon",
  },
];
