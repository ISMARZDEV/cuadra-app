import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// Mock the boundaries (cuadra-mobile-testing §3): the SSE transport and the generated SDK.
// The hook owns the logic; the transport (expo/fetch) and `resume` are stubbed.
vi.mock("./chat-stream", () => ({ streamChat: vi.fn() }));
vi.mock("@cuadra/api-client", () => ({ resume: vi.fn() }));
// The hook must send the APP's chosen language (i18n), NOT the raw device locale — else a
// Spanish user on an English phone gets English replies (cuadra-mobile §5).
vi.mock("@/i18n", () => ({ getLanguage: () => "en" }));

import { resume } from "@cuadra/api-client";

import { streamChat } from "./chat-stream";
import { useChat } from "./use-chat";

const mockStream = vi.mocked(streamChat);
const mockResume = vi.mocked(resume);

describe("useChat", () => {
  test("send appends a user message and streams the agent tokens into one reply", async () => {
    mockStream.mockImplementation(async ({ onEvent }) => {
      onEvent({ type: "token", content: "Hola " });
      onEvent({ type: "token", content: "mundo" });
      onEvent({ type: "done", thread_id: "t1" });
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("hola");
    });

    expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({ message: "hola" }));
    expect(result.current.messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      "user:hola",
      "agent:Hola mundo",
    ]);
    expect(result.current.threadId).toBe("t1");
  });

  test("send forwards the app language (i18n) as locale, not the device locale", async () => {
    mockStream.mockImplementation(async ({ onEvent }) => {
      onEvent({ type: "done", thread_id: "t3" });
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("hello");
    });

    expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });

  test("a pending event exposes the confirm action; confirm() resumes and appends the reply", async () => {
    mockStream.mockImplementation(async ({ onEvent }) => {
      onEvent({
        type: "pending",
        action: { summary: "registrar RD$500 en Gasolina", requires_confirmation: true },
      });
      onEvent({ type: "done", thread_id: "t2" });
    });
    mockResume.mockResolvedValue({
      data: { thread_id: "t2", reply: "Listo, registré RD$500.", pending_action: null },
    } as never);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("gasté 500 en gasolina");
    });
    expect(result.current.pending?.summary).toBe("registrar RD$500 en Gasolina");

    await act(async () => {
      await result.current.confirm(true);
    });
    expect(mockResume).toHaveBeenCalledWith(
      expect.objectContaining({ body: { thread_id: "t2", approved: true } }),
    );
    expect(result.current.pending).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "agent",
      text: "Listo, registré RD$500.",
    });
  });
});
