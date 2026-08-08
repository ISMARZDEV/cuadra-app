// `live` = tiene catálogo y navega · `soon` = existe como promesa y abre su hoja de estado.
// No es decoración: es lo que decide si el card lleva a algún lado.
export type VerticalStatus = "live" | "soon";

// Promotions NO está: las promociones no tienen catálogo propio, son un atributo de las otras
// (oferta del súper, cashback de la tarjeta, tasa promocional del préstamo). Por eso el badge de
// descuento vive en la tarjeta de producto y no en una vertical.
export type VerticalId = "supermarket" | "cards" | "loans" | "investments";
