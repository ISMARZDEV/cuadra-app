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
}

export interface ChatDockProps {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}
