import type { AgentSegment } from "./components/agent-bubble";

// Seed conversation mirroring the Figma "Aispace Chat" frame (178:5090).
// Content is sample agent/user output (it comes from POST /v1/aispace/chat in real use),
// so it lives as mock data, not i18n chrome.
export type ChatItem =
  | { kind: "agent"; id: string; title?: string; segments: AgentSegment[] }
  | { kind: "user"; id: string; text: string }
  | { kind: "receipt"; id: string };

export const CHAT_THREAD: ChatItem[] = [
  {
    kind: "agent",
    id: "1",
    title: "Hey, Sure. 😉👋",
    segments: [
      { text: "I can help you store your " },
      { text: "receipts securely", bold: true },
      { text: ", categorize your expenses, and prepare a report for reimbursement." },
    ],
  },
  { kind: "user", id: "2", text: "Great. I just uploaded a receipt screenshot from a Uber." },
  { kind: "agent", id: "3", segments: [{ text: "Ok, send me the receipt..." }] },
  { kind: "receipt", id: "4" },
  { kind: "agent", id: "5", segments: [{ text: "Analizing, One minute...", bold: true }] },
];
