import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { DockOption } from "./interfaces";

// Mock the transport + i18n so the hook runs without the network / expo-fetch.
const streamChat = vi.fn();
const resumeChat = vi.fn();
vi.mock("./chat-stream", () => ({
  streamChat: (...args: unknown[]) => streamChat(...args),
  resumeChat: (...args: unknown[]) => resumeChat(...args),
}));
vi.mock("@/i18n", () => ({ getLanguage: () => "es" }));

import { ChatRole } from "./enums";
import { useChat } from "./use-chat";

const pill = (value: string, label: string, variant: "primary" | "secondary"): DockOption => ({
  value,
  label,
  variant,
  kind: "pill",
});

beforeEach(() => {
  streamChat.mockReset();
  resumeChat.mockReset();
});

describe("useChat — multi-step HITL", () => {
  test("send appends a user message and streams the agent tokens into one reply", async () => {
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent({ type: "token", content: "Hola " });
      onEvent({ type: "token", content: "mundo" });
      onEvent({ type: "done", thread_id: "t1" });
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("hola");
    });

    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({ message: "hola" }));
    expect(result.current.messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      "user:hola",
      "agent:Hola mundo",
    ]);
    expect(result.current.threadId).toBe("t1");
  });

  test("send forwards the app language (i18n) as locale, not the device locale", async () => {
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent({ type: "done", thread_id: "t3" });
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("hello");
    });

    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({ locale: "es" }));
  });

  test("send streams tokens then opens the confirm interaction", async () => {
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent({ type: "token", content: "Wow!!! 🫣 " });
      onEvent({
        type: "interaction",
        interaction: { prompt: "¿Registrar este gasto de $500 USD?", options: [pill("confirm", "Sí", "primary")] },
      });
      onEvent({ type: "done", thread_id: "t1" });
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("gasté 500 en spotify");
    });

    expect(result.current.messages.some((m) => m.text.includes("Wow"))).toBe(true);
    expect(result.current.interaction?.prompt).toContain("$500");
  });

  test("select echoes a user bubble, resumes with the value, and advances to the next step", async () => {
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent({ type: "interaction", interaction: { prompt: "confirm?", options: [] } });
      onEvent({ type: "done", thread_id: "t1" });
    });
    resumeChat.mockResolvedValue({
      reply: null,
      interaction: { prompt: "¿Deseas colocarlo en alguna categoria?", options: [] },
      links: [],
      threadId: "t1",
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("gasté 500");
    });
    await act(async () => {
      await result.current.select(pill("confirm", "Sí, confirmar 😉", "primary"), "confirm?");
    });

    expect(resumeChat).toHaveBeenCalledWith("t1", "confirm");
    // the answered step's QUESTION (passed by the screen) is pushed to the chat (agent) alongside the answer
    expect(result.current.messages.some((m) => m.role === ChatRole.Agent && m.text === "confirm?")).toBe(true);
    expect(
      result.current.messages.some((m) => m.role === ChatRole.User && m.text === "Sí, confirmar 😉"),
    ).toBe(true);
    expect(result.current.interaction?.prompt).toContain("categoria");
  });

  test("a final chip selection echoes '🎵 …', renders the reply and the deep link", async () => {
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent({ type: "interaction", interaction: { prompt: "sug?", options: [] } });
      onEvent({ type: "done", thread_id: "t1" });
    });
    resumeChat.mockResolvedValue({
      reply: "Listo, tu gasto ha sido registrado ✅",
      interaction: null,
      links: [{ text: "Ver en Insight", href: "insights" }],
      threadId: "t1",
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("gasté 500");
    });
    await act(async () => {
      await result.current.select({ value: "music", label: null, variant: "primary", kind: "chip", icon: "🎵" });
    });

    expect(result.current.messages.some((m) => m.role === ChatRole.User && m.text === "🎵 music")).toBe(true);
    expect(result.current.messages.some((m) => m.text.includes("registrado"))).toBe(true);
    const link = result.current.messages.find((m) => m.href === "insights");
    expect(link?.text).toBe("Ver en Insight");
    expect(result.current.interaction).toBeNull();
  });
});
