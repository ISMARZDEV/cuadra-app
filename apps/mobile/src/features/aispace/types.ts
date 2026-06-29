import type {
  ChatDoneEvent,
  ChatErrorEvent,
  ChatPendingEvent,
  ChatTokenEvent,
} from "./interfaces";

// AISpace chat type aliases (feature-local; structure §3 → features/{…, types}). Genuine aliases /
// unions live here; object shapes are interfaces (./interfaces) and value sets are enums (./enums).

// The action staged by a write tool, awaiting human confirmation (HITL §7.4). `summary` is the
// localized line the agent asks the user to approve; the rest is opaque metadata. Intersection with
// an index signature → a `type` (an interface can't add `summary` over an index signature).
export type PendingAction = { summary?: string } & Record<string, unknown>;

// Discriminated union of the SSE frames (members are interfaces in ./interfaces).
export type ChatStreamEvent = ChatTokenEvent | ChatPendingEvent | ChatDoneEvent | ChatErrorEvent;
