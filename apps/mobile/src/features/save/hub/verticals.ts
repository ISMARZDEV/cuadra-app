import type { Href } from "expo-router";

import type { Vertical } from "../interfaces";

// Las verticales de Save. Es un REGISTRO, no cuatro JSX: el hub renderiza este array, así que
// agregar una vertical el día que tenga datos es una fila y un asset, no una pantalla nueva.
//
// `Promotions` NO está, y no es un olvido — ver el porqué en `../types.ts`.
//
// `art` falta a propósito en Loans e Investments: el diseño todavía no les dibujó ilustración, y
// el panel se sostiene solo con su trazo. Un placeholder inventado se vería peor que el vacío.
export const VERTICALS: readonly Vertical[] = [
  {
    id: "supermarket",
    title: "Supermarket",
    blurbKey: "save.hub.supermarket.blurb",
    status: "live",
    href: "/save/supermarket" as Href,
    art: require("../../../assets/save/verticals/supermarket.png"),
    featured: true,
  },
  {
    id: "cards",
    title: "Credit Cards",
    blurbKey: "save.hub.cards.blurb",
    status: "soon",
    art: require("../../../assets/save/verticals/cards.png"),
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
