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

import { ChatRole, ChatStatus } from "./enums";
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
      uiActions: [],
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
      uiActions: [{ type: "link", text: "Ver en Insight", href: "insights" }],
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

  test("al elegir un producto en el dock, la TARJETA llega — no sólo el texto", async () => {
    // Bug real, visto en el device: el usuario elegía «Arroz Pimco Premium 10 Lbs», el agente
    // contestaba «Acá está …:» y NO aparecía nada más. La respuesta del dock viaja por
    // `/chat/resume`, y ese camino leía sólo `links`, así que la tarjeta se descartaba callada.
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent({ type: "interaction", interaction: { prompt: "¿Cuál?", options: [] } });
      onEvent({ type: "done", thread_id: "t1" });
    });
    resumeChat.mockResolvedValue({
      reply: "Acá está Arroz Pimco Premium 10 Lbs:",
      interaction: null,
      uiActions: [
        {
          type: "product",
          name: "Arroz Pimco Premium 10 Lbs",
          captured_at: "2026-08-02",
          stores: [{ provider: "Sirena", price: "RD$525.00", is_cheapest: false }],
        },
      ],
      threadId: "t1",
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("¿dónde está más barato el arroz?");
    });
    await act(async () => {
      await result.current.select({ value: "cid-1", label: "Arroz Pimco Premium 10 Lbs", variant: "primary" });
    });

    const card = result.current.messages.find((m) => m.product);
    expect(card?.product?.name).toBe("Arroz Pimco Premium 10 Lbs");
    expect(card?.product?.stores[0].price).toBe("RD$525.00");
  });
});

describe("useChat — status signal", () => {
  // NOTE on timing: assertions read `result.current` AFTER the turn settles, never inside the
  // `onEvent` callback. React hasn't re-rendered yet at that point, so a mid-flight read returns
  // the PREVIOUS render's value — it measures the wrong instant, not the hook's behaviour. Nothing
  // resets the status when a turn ends (the indicator is already hidden by `isThinking`), so what
  // survives the turn is exactly what was last announced.
  const stream = (events: unknown[]) => {
    streamChat.mockImplementation(async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
      for (const e of events) onEvent(e);
      onEvent({ type: "done", thread_id: "t1" });
    });
  };

  test("adopts the status the backend announces while a tool runs", async () => {
    const { result } = renderHook(() => useChat());
    stream([{ type: "status", value: "searching" }]);

    await act(async () => {
      await result.current.send("arroz");
    });

    expect(result.current.status).toBe(ChatStatus.Searching);
  });

  test("keeps the LAST status when the agent chains tools", async () => {
    const { result } = renderHook(() => useChat());
    stream([
      { type: "status", value: "searching" },
      { type: "status", value: "reasoning" },
    ]);

    await act(async () => {
      await result.current.send("canasta de 5000");
    });

    expect(result.current.status).toBe(ChatStatus.Reasoning);
  });

  test("ignores an unknown status instead of rendering garbage", async () => {
    // A backend that grows a fourth state must not break this client: the generic (and always
    // true) "thinking" is the safe degradation.
    const { result } = renderHook(() => useChat());
    stream([{ type: "status", value: "teletransportando" }]);

    await act(async () => {
      await result.current.send("hola");
    });

    expect(result.current.status).toBe(ChatStatus.Thinking);
  });

  test("starts every turn back at thinking", async () => {
    const { result } = renderHook(() => useChat());
    stream([{ type: "status", value: "reasoning" }]);
    await act(async () => {
      await result.current.send("canasta de 5000");
    });

    // A turn that calls no tool must not inherit the previous turn's "Razonando".
    stream([]);
    await act(async () => {
      await result.current.send("gracias");
    });

    expect(result.current.status).toBe(ChatStatus.Thinking);
  });
});
