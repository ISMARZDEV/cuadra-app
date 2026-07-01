import { fetch } from "expo/fetch";

import { API_BASE_URL, getApiAuthToken } from "@/lib/api/client";

import type { DockInteraction, StreamChatArgs } from "./interfaces";
import type { ChatStreamEvent } from "./types";

// Result of resuming a paused HITL step (POST /chat/resume). The graph either pauses at the NEXT
// step (`interaction` set) or finishes (`reply` + any `links`).
export interface ResumeResult {
  reply: string | null;
  interaction: DockInteraction | null;
  links: { text: string; href: string }[];
  threadId: string;
}

// Resume a multi-step flow with the chosen option `value`. Hand-rolled on expo/fetch (like
// streamChat) so we control the body — the generated SDK's resume still models only the legacy
// `approved` bool, and this endpoint is plain JSON (no stream).
export async function resumeChat(threadId: string, value: string): Promise<ResumeResult> {
  const token = getApiAuthToken();
  const res = await fetch(`${API_BASE_URL}/v1/aispace/chat/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ thread_id: threadId, value }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    thread_id: string;
    reply: string | null;
    interaction: DockInteraction | null;
    links?: { text: string; href: string }[];
  };
  return {
    reply: data.reply ?? null,
    interaction: data.interaction ?? null,
    links: data.links ?? [],
    threadId: data.thread_id,
  };
}

// SSE client for the AISpace chat (backend POST /v1/aispace/chat/stream, §7.6). The generated
// hey-api SDK can't model a token stream, so we hand-roll it on `expo/fetch` — the SDK-56
// WinterCG fetch with real ReadableStream support on native (no react-native-sse needed). The
// native EventSource is unusable here anyway (it can't send the Authorization header). The event
// protocol (token/pending/done/error frames) lives in ./interfaces + ./types.
export async function streamChat({
  message,
  threadId,
  locale,
  signal,
  onEvent,
}: StreamChatArgs): Promise<void> {
  const token = getApiAuthToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/v1/aispace/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, thread_id: threadId ?? null, locale }),
      signal,
    });
  } catch (e) {
    onEvent({ type: "error", message: e instanceof Error ? e.message : "network error" });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `HTTP ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; a single read may carry several (or a partial).
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (!frame.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(frame.slice(5).trim()) as ChatStreamEvent);
      } catch {
        // ignore malformed frame (keep streaming)
      }
    }
  }
}
