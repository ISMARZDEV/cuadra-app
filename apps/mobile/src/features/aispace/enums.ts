// AISpace chat enums (feature-local; structure §3 → features/{…, enums}).

// Who authored a chat turn. A closed two-value set → enum (house style).
export enum ChatRole {
  User = "user",
  Agent = "agent",
}

// What the agent is doing while a turn is in flight, before any output arrives. Drives the
// shimmering status line (typing-indicator.tsx): each value picks its own icon + label.
//
// Only the first THREE arrive off the wire (backend `orchestration/status.py` emits exactly
// thinking/searching/reasoning). `Validating` and `Analyzing` are DISPLAY-ONLY steps: the client
// walks through them while a search runs, to show progress the backend has no way to report at
// that granularity. See `use-status-sequence.ts` for why that choreography lives here.
export enum ChatStatus {
  Thinking = "thinking",
  Searching = "searching",
  Reasoning = "reasoning",
  Validating = "validating",
  Analyzing = "analyzing",
}
