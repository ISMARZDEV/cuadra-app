import type {
  ChatBasketEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatInteractionEvent,
  ChatLinkEvent,
  ChatProductEvent,
  ChatProviderProductsEvent,
  ChatTokenEvent,
} from "./interfaces";

// AISpace chat type aliases (feature-local; structure §3 → features/{…, interfaces}). Genuine aliases /
// unions live here; object shapes are interfaces (./interfaces) and value sets are enums (./enums).

// Discriminated union of the SSE frames (members are interfaces in ./interfaces).
export type ChatStreamEvent =
  | ChatTokenEvent
  | ChatInteractionEvent
  | ChatLinkEvent
  | ChatProductEvent
  | ChatBasketEvent
  | ChatProviderProductsEvent
  | ChatDoneEvent
  | ChatErrorEvent;

// Visual weight of a dock option pill: `primary` = lime affirmative (Sí/confirmar), `secondary` =
// translucent green (No/cancelar). A string-literal union (not a nominal enum) on purpose — these
// are presentation hints the dock interaction protocol carries, kept ergonomic for props.
export type DockOptionVariant = "primary" | "secondary";

// How a dock option renders: `pill` = text button (confirm / category yes-no); `chip` = round
// icon-only avatar (category suggestions — Img 10); `product` = carousel card (groceries picker).
// The backend tags each option with its kind.
export type DockOptionKind = "pill" | "chip" | "product";
