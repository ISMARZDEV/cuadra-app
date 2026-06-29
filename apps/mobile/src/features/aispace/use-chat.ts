import { useCallback, useRef, useState } from "react";

import { resume } from "@cuadra/api-client";

import { getLanguage } from "@/i18n";

import { streamChat } from "./chat-stream";
import { ChatRole } from "./enums";
import type { ChatMessage } from "./interfaces";
import type { PendingAction } from "./types";

let _seq = 0;
const uid = () => `m${++_seq}`;

// Chat state machine over the SSE transport. Owns the message list, the live thread_id and the
// pending HITL action. `send` streams a turn (tokens append to one agent bubble); `confirm`
// approves/cancels a staged write via POST /chat/resume.
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const threadRef = useRef<string | null>(null);
  const streamingRef = useRef(false); // re-entry guard (read synchronously, unlike state)
  const [threadId, setThreadId] = useState<string | null>(null);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streamingRef.current) return;
    streamingRef.current = true;
    setIsStreaming(true);
    setMessages((m) => [...m, { id: uid(), role: ChatRole.User, text: trimmed }]);

    let agentId: string | null = null;
    await streamChat({
      message: trimmed,
      threadId: threadRef.current,
      locale: getLanguage(), // the APP's chosen language (i18n), not the device locale (cuadra-mobile §5)
      onEvent: (e) => {
        if (e.type === "token") {
          setMessages((m) => {
            if (!agentId) {
              agentId = uid();
              return [...m, { id: agentId, role: ChatRole.Agent, text: e.content }];
            }
            return m.map((msg) => (msg.id === agentId ? { ...msg, text: msg.text + e.content } : msg));
          });
        } else if (e.type === "pending") {
          setPending(e.action as PendingAction);
        } else if (e.type === "done") {
          threadRef.current = e.thread_id;
          setThreadId(e.thread_id);
        } else if (e.type === "error") {
          setMessages((m) => [
            ...m,
            { id: uid(), role: ChatRole.Agent, text: "⚠️ No pude responder. Intenta de nuevo." },
          ]);
        }
      },
    });

    streamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const confirm = useCallback(async (approved: boolean) => {
    const tid = threadRef.current;
    if (!tid) return;
    setPending(null);
    const res = await resume({ body: { thread_id: tid, approved } });
    const reply = res.data?.reply;
    if (reply) setMessages((m) => [...m, { id: uid(), role: ChatRole.Agent, text: reply }]);
  }, []);

  return { messages, pending, isStreaming, threadId, send, confirm };
}
