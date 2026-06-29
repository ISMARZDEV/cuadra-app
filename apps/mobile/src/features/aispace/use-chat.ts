import { useCallback, useRef, useState } from "react";

import { getLanguage } from "@/i18n";

import { resumeChat, streamChat } from "./chat-stream";
import { ChatRole } from "./enums";
import type { ChatMessage, DockInteraction, DockOption } from "./interfaces";

let _seq = 0;
const uid = () => `m${++_seq}`;

// Chat state machine over the SSE transport. Owns the message list, the live thread_id and the
// current HITL step (`interaction`). `send` streams a turn (tokens append to one agent bubble);
// `select` picks an option of the current step — it echoes the choice as a user bubble, resumes the
// graph (POST /chat/resume with the option value), then renders either the NEXT step or the final
// reply + deep links (the multi-step expense flow: confirm → ¿categoría? → sugerencias → done).
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interaction, setInteraction] = useState<DockInteraction | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // `isThinking` = a turn is in flight but the agent hasn't produced anything yet (no token, no
  // interaction). Drives the typing-dots indicator; cleared the moment the first output arrives.
  const [isThinking, setIsThinking] = useState(false);
  const threadRef = useRef<string | null>(null);
  const streamingRef = useRef(false); // re-entry guard (read synchronously, unlike state)
  const [threadId, setThreadId] = useState<string | null>(null);

  const appendAgent = useCallback((text: string, href?: string) => {
    setMessages((m) => [...m, { id: uid(), role: ChatRole.Agent, text, href }]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streamingRef.current) return;
      streamingRef.current = true;
      setIsStreaming(true);
      setIsThinking(true);
      setMessages((m) => [...m, { id: uid(), role: ChatRole.User, text: trimmed }]);

      let agentId: string | null = null;
      await streamChat({
        message: trimmed,
        threadId: threadRef.current,
        locale: getLanguage(), // the APP's chosen language (i18n), not the device locale (cuadra-mobile §5)
        onEvent: (e) => {
          if (e.type === "token") {
            setIsThinking(false);
            setMessages((m) => {
              if (!agentId) {
                agentId = uid();
                return [...m, { id: agentId, role: ChatRole.Agent, text: e.content }];
              }
              return m.map((msg) => (msg.id === agentId ? { ...msg, text: msg.text + e.content } : msg));
            });
          } else if (e.type === "interaction") {
            setIsThinking(false);
            setInteraction(e.interaction); // first HITL step (e.g. confirm) — dock opens
          } else if (e.type === "link") {
            appendAgent(e.text, e.href); // deep link as a tappable message (Img 11)
          } else if (e.type === "done") {
            threadRef.current = e.thread_id;
            setThreadId(e.thread_id);
          } else if (e.type === "error") {
            setIsThinking(false);
            appendAgent("⚠️ No pude responder. Intenta de nuevo.");
          }
        },
      });

      streamingRef.current = false;
      setIsStreaming(false);
      setIsThinking(false);
    },
    [appendAgent],
  );

  const select = useCallback(
    async (option: DockOption) => {
      const tid = threadRef.current;
      if (!tid) return;
      // Echo the choice as a user bubble: a pill shows its label, an icon-only chip shows "🎵 música".
      const echo = option.label ?? `${option.icon ?? ""} ${option.value}`.trim();
      setMessages((m) => [...m, { id: uid(), role: ChatRole.User, text: echo }]);
      setInteraction(null);
      setIsThinking(true); // the backend resumes the graph; show the dots meanwhile
      try {
        const res = await resumeChat(tid, option.value);
        if (res.interaction) {
          setInteraction(res.interaction); // next step (¿categoría? → sugerencias)
        } else {
          if (res.reply) appendAgent(res.reply); // final reply ("Listo, registrado ✅")
          res.links.forEach((l) => appendAgent(l.text, l.href)); // "Ver en Insight"
        }
      } catch {
        appendAgent("⚠️ No pude completar la acción. Intenta de nuevo.");
      } finally {
        setIsThinking(false);
      }
    },
    [appendAgent],
  );

  return { messages, interaction, isStreaming, isThinking, threadId, send, select };
}
