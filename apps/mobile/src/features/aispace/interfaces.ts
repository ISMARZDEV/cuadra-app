import type { ReactNode, RefObject } from "react";
import type { TextInput } from "react-native";

import type { ChatRole } from "./enums";
import type { ChatStreamEvent, DockOptionKind, DockOptionVariant } from "./types";

// AISpace chat interfaces (feature-local; structure §3 → features/{…, interfaces}). Kept apart from
// the components/hook so the transport, the hook, the screen and the bubbles share one definition.

// One chat turn. Agent replies are plain streamed text (tokens) — no rich segments yet (the static
// mock used AgentSegment[]; real replies arrive as a token stream). `href` (when present) makes the
// message a tappable deep link (e.g. "Ver en Insight" → Insights, Img 11).
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  href?: string;
  // La comparación de Save, pintada DENTRO de la burbuja. Va acá y no como texto porque mandar al
  // navegador abandona la conversación, y porque estos números no los reescribe el modelo: viajan
  // del backend a la tarjeta tal cual (§5.5).
  product?: ProductCardData;
  // Canasta por presupuesto: tabs de supermercados + carrusel de productos.
  basket?: BasketCardData;
  // Lista de productos por proveedor (ej. resultados de búsqueda de groceries).
  provider_products?: ProviderProductsData;
}

// Una fila de la tarjeta: una tienda con su precio YA formateado por el backend.
export interface ProductStorePrice {
  provider: string;
  price: string;
  // Booleano y no la cadena "Más barato": el backend manda el HECHO y el cliente pone la palabra,
  // que es quien tiene i18n. Con una sola tienda llega siempre en false (§8.1: sin con qué
  // comparar, "el más barato" es una afirmación falsa).
  is_cheapest: boolean;
  url?: string | null;
}

export interface ProductCardData {
  name: string;
  brand?: string | null;
  image_url?: string | null;
  captured_at?: string | null;
  stores: ProductStorePrice[];
}

// ── Product list (shared basket/grocery UI item) ─────────────────────────────
// One product shown in a provider carousel. Money strings are already formatted by the backend.
export interface ProductListItemData {
  index: number;
  canonical_product_id: string;
  name: string;
  brand?: string | null;
  size?: string | null;
  image_url?: string | null;
  url?: string | null;
  unit_price: string;
}

// One item inside a provider's basket. Basket-specific fields extend the shared item.
export interface BasketItemData extends ProductListItemData {
  subtotal: string;
  units: number;
}

// One provider's shopping basket for the requested budget.
export interface BasketProviderData {
  provider_id: string;
  provider_name: string;
  total: string;
  remaining: string;
  items_count: number;
  groups_covered: string[];
  groups_unavailable: string[];
  groups_unaffordable: string[];
  is_cheapest: boolean;
  items: BasketItemData[];
}

// Payload for the basket-by-budget card rendered inside the agent bubble.
export interface BasketCardData {
  budget: string;
  currency: string;
  providers: BasketProviderData[];
}

// ── Provider product list (e.g. groceries search results) ────────────────────
// One provider's product list shown in a chat carousel. Same visuals as a basket item,
// but without budget/canasta-specific totals — the agent explains that in plain text.
export interface ProviderProductsProviderData {
  provider_id: string;
  provider_name: string;
  items: ProductListItemData[];
}

export interface ProviderProductsData {
  currency: string;
  providers: ProviderProductsProviderData[];
}

// SSE event protocol (one JSON object per `data:` frame), mirrors the controller. Discriminants stay
// string literals on purpose: they ARE the JSON wire values, so a nominal enum would fight the
// `{ type: "token" }` objects that arrive off the network.
export interface ChatTokenEvent {
  type: "token";
  content: string;
}
// A HITL step: the graph paused at an interrupt() carrying the next interaction to render.
export interface ChatInteractionEvent {
  type: "interaction";
  interaction: DockInteraction;
}
// A deep link the flow emitted (e.g. "Ver en Insight" → insights). Rendered as a tappable message.
export interface ChatLinkEvent {
  type: "link";
  text: string;
  href: string;
}
// La tarjeta de comparación de Save. `sse.py` la emite verbatim desde `ui_actions`, sin conocerla.
export interface ChatProductEvent extends ProductCardData {
  type: "product";
}
// La canasta por presupuesto, emitida como un frame de ui_action.
export interface ChatBasketEvent extends BasketCardData {
  type: "basket";
}
// Lista de productos por proveedor (gemelo de la canasta, sin totales).
export interface ChatProviderProductsEvent extends ProviderProductsData {
  type: "provider_products";
}
// Una `ui_action` tal como la emite el backend. Es la MISMA forma en el stream (un frame por
// acción) y en el body de `/chat/resume` — tener dos contratos para lo mismo fue el bug que hizo
// desaparecer la tarjeta al elegir en el dock.
export type ChatUiAction =
  | { type: "link"; text: string; href: string }
  | ({ type: "product" } & ProductCardData)
  | ({ type: "basket" } & BasketCardData)
  | ({ type: "provider_products" } & ProviderProductsData);

export interface ChatDoneEvent {
  type: "done";
  thread_id: string;
}
export interface ChatErrorEvent {
  type: "error";
  message?: string;
}

// Args for the SSE transport (streamChat).
export interface StreamChatArgs {
  message: string;
  threadId?: string | null;
  locale?: string;
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}

// Component props.
export interface ChatInputBarProps {
  inputRef?: RefObject<TextInput | null>;
  onSend?: (text: string) => void;
}

// ── Glass dock (collapsible panel above the input) ──────────────────────────
// One selectable option inside a dock interaction, mirroring the backend wire shape. `value` is what
// we send back to /chat/resume; `variant` styles it; `kind` picks pill (text) vs chip (round
// icon-only); `icon` is an emoji (chips, or an optional leading glyph on a pill). `label` is null for
// icon-only chips.
export interface DockOption {
  value: string;
  label?: string | null;
  variant: DockOptionVariant;
  kind?: DockOptionKind;
  icon?: string | null;
  color?: string | null; // chip ring color (per-category accent, Img 10)
  // Product data when kind === "product" — rendered as a carousel card instead of a pill/chip.
  product?: ProductListItemData & { currency: string };
}

// A single human-in-the-loop step the dock renders: a prompt + the options to pick from. Generic on
// purpose — the backend (Fase 2) emits these and the dock paints them, so any flow works unchanged.
// In Fase 1 we map the current single-step `pending` (summary + approve/cancel) into this shape.
export interface DockInteraction {
  prompt: string;
  options: DockOption[];
}

export interface QuickActionsProps {
  // Tapping a suggestion chip sends that prompt to the chat.
  onSelect: (prompt: string) => void;
}

export interface ChatEmptyStateProps {
  // Tapping a widget sends its canned prompt to the chat, same contract as QuickActions — for now
  // just a plain message (see chat-empty-state.tsx TODOs for the real catalog + flow wiring).
  onSelect: (prompt: string) => void;
  // The scroll viewport's measured height (chat-screen.tsx) — drives the center→top dock entrance.
  // Omit/0 to skip the dock animation (renders in place).
  viewportHeight?: number;
}

export interface DockInteractionViewProps {
  interaction: DockInteraction;
  // Reports the whole option (not just its value): the hook needs `label`/`icon` to echo the choice
  // as a user bubble ("Sí, confirmar 😉" / "🎵 música") before resuming.
  onSelect: (option: DockOption) => void;
  // Tapping the product's view/eye button opens the product in Save instead of selecting it.
  onViewProduct?: (option: DockOption) => void;
}

export interface ChatDockProps {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}
