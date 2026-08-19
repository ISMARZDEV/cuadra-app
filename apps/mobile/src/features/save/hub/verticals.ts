import type { Href } from "expo-router";

import type { Vertical } from "../interfaces";

// Los emblemas van como PNG (399×399 = los 133pt del diseño a @3x) y por eso se piden con
// `require`: Metro los sirve como ASSET, fuera del bundle de JS. Ver el porqué en `../interfaces`.
const CHECK_EMBLEM = require("../../../assets/save/check-emblem.png");
const SUPERMARKET_EMBLEM = require("../../../assets/save/supermarket-emblem.png");

// Las verticales de Save. Es un REGISTRO, no cuatro JSX: el hub renderiza este array, así que
// agregar una vertical el día que tenga datos es una fila y un asset, no una pantalla nueva.
//
// `Promotions` NO está, y no es un olvido — ver el porqué en `../types.ts`.
//
// `check-emblem` es el emblema GENÉRICO de marca: lo llevan las tres verticales que todavía no
// tienen ilustración propia. Antes quedaban con el panel pelado, y un panel vacío junto a uno
// ilustrado no se lee como «sobria», se lee como «falta el asset».
export const VERTICALS: readonly Vertical[] = [
  {
    id: "supermarket",
    title: "Supermarket",
    titleLines: ["Super", "market"],
    blurbKey: "save.hub.supermarket.blurb",
    status: "live",
    href: "/save/supermarket" as Href,
    art: SUPERMARKET_EMBLEM,
    featured: true,
  },
  {
    id: "cards",
    title: "Credit Cards",
    titleLines: ["Credit", "Cards"],
    blurbKey: "save.hub.cards.blurb",
    status: "soon",
    art: CHECK_EMBLEM,
  },
  {
    id: "loans",
    title: "Loans & Insurance",
    titleLines: ["Loans &", "Insurance"],
    blurbKey: "save.hub.loans.blurb",
    status: "soon",
    art: CHECK_EMBLEM,
  },
  {
    id: "investments",
    title: "Investments",
    // La ÚNICA que se parte por dentro de una palabra: «Investments» a 30pt necesita ~196pt y en el
    // blanco del card quedan 145, así que en una línea sale truncada con «…». En el diseño el
    // problema no aparece porque Asap Condensed es bastante más angosta que Kantumruy.
    //
    // El corte va donde lo pide la sílaba (In·vest·ments) y LLEVA GUION. Antes era «Invest/ments»
    // pelado, que no se lee como una palabra partida sino como dos palabras rotas — el guion es
    // justamente la señal de «esto sigue abajo». Es tipografía, no adorno.
    titleLines: ["Invest-", "ments"],
    blurbKey: "save.hub.investments.blurb",
    status: "soon",
    art: CHECK_EMBLEM,
  },
];
