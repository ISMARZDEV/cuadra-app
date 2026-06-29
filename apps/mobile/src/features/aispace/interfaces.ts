import type { RefObject } from "react";
import type { TextInput } from "react-native";

import type { ChatRole } from "./enums";
import type { ChatStreamEvent } from "./types";

// AISpace chat interfaces (feature-local; structure §3 → features/{…, interfaces}). Kept apart from
// the components/hook so the transport, the hook, the screen and the bubbles share one definition.

// One chat turn. Agent replies are plain streamed text (tokens) — no rich segments yet (the static
// mock used AgentSegment[]; real replies arrive as a token stream).
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

// SSE event protocol (one JSON object per `data:` frame), mirrors the controller. Discriminants stay
// string literals on purpose: they ARE the JSON wire values, so a nominal enum would fight the
// `{ type: "token" }` objects that arrive off the network.
export interface ChatTokenEvent {
  type: "token";
  content: string;
}
export interface ChatPendingEvent {
  type: "pending";
  action: Record<string, unknown>;
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

export interface ConfirmActionCardProps {
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}
