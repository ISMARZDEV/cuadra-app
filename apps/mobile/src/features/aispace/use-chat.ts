import { useCallback, useRef, useState } from "react";

import { getLanguage } from "@/i18n";

import { resumeChat, streamChat } from "./chat-stream";
import { ChatRole } from "./enums";
import type { ChatMessage, DockInteraction, DockOption } from "./interfaces";

let _seq = 0;
const uid = () => `m${++_seq}`;

// Chat state machine over the SSE transport. Owns the message list, the live thread_id and the
// current HITL step (`interaction`). `send` streams a turn (tokens append to one agent bubble);
// `select` picks an option of the current step — it pushes that step's QUESTION + the chosen answer
// into the chat history (so the conversation keeps the Q&A), resumes the graph, and either SWAPS the
// dock to the next step or renders the final reply + deep links. The interaction is kept set through
// the resume (swapped, never nulled mid-flight) so the dock doesn't flash the quick-actions menu
// between steps.
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interaction, setInteractionState] = useState<DockInteraction | null>(null);
  const interactionRef = useRef<DockInteraction | null>(null);
  const setInteraction = useCallback((next: DockInteraction | null) => {
    interactionRef.current = next; // ref mirrors state so `select` can read the question synchronously
    setInteractionState(next);
  }, []);
  const [isStreaming, setIsStreaming] = useState(false);
  // `isThinking` = a turn is in flight but the agent hasn't produced anything yet. Drives the
  // typing-dots; cleared the moment the first output arrives.
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
    [appendAgent, setInteraction],
  );

  const select = useCallback(
    async (option: DockOption) => {
      const tid = threadRef.current;
      if (!tid) return;
      const question = interactionRef.current?.prompt; // the step being answered
      // A pill echoes its label; an icon-only chip echoes "🎵 value".
      const echo = option.label ?? `${option.icon ?? ""} ${option.value}`.trim();
      // Move the answered step into the chat: its question (agent) + the chosen answer (user bubble).
      setMessages((m) => [
        ...m,
        ...(question ? [{ id: uid(), role: ChatRole.Agent, text: question }] : []),
        { id: uid(), role: ChatRole.User, text: echo },
      ]);
      setIsThinking(true); // keep the interaction set (dock stays open) until the next step swaps in
      try {
        const res = await resumeChat(tid, option.value);
        setInteraction(res.interaction ?? null); // swap to the next step, or close when the flow ends
        if (!res.interaction) {
          if (res.reply) appendAgent(res.reply); // final reply ("Listo, registrado ✅")
          res.links.forEach((l) => appendAgent(l.text, l.href)); // "Ver en Insight"
        }
      } catch {
        setInteraction(null);
        appendAgent("⚠️ No pude completar la acción. Intenta de nuevo.");
      } finally {
        setIsThinking(false);
      }
    },
    [appendAgent, setInteraction],
  );

  return { messages, interaction, isStreaming, isThinking, threadId, send, select };
}
