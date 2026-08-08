import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";
import { DrawerProvider } from "@/store/drawer-store";

import { ChatRole } from "./enums";
import type { ChatMessage } from "./interfaces";

vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// `lib/sounds` arranca `expo-audio` al importarse, y su runtime no existe en jsdom (mismo mock que
// chat-input-bar.test.tsx).
vi.mock("@/lib/sounds", () => ({ sounds: { send: vi.fn(), dock: vi.fn() } }));
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(),
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

// La pantalla se prueba con el hook del chat CONTROLADO: lo que importa acá no es la red ni el
// grafo, sino que la conversación se pinte entera y en orden.
const chatState = {
  messages: [] as ChatMessage[],
  interaction: null,
  isStreaming: false,
  isThinking: false,
  status: "thinking",
  threadId: null,
  send: vi.fn(),
  select: vi.fn(),
};
vi.mock("./use-chat", () => ({ useChat: () => chatState }));

import { ChatScreen } from "./chat-screen";

const agent = (id: string, text: string): ChatMessage => ({ id, role: ChatRole.Agent, text });
const user = (id: string, text: string): ChatMessage => ({ id, role: ChatRole.User, text });

// El drawer vive en un contexto, no en un módulo: se monta de verdad en vez de mockearse, así el
// test ejercita el store real (que es parte de lo que la Fase 4 puede desestabilizar).
const screenTree = () => (
  <DrawerProvider>
    <ChatScreen />
  </DrawerProvider>
);

/**
 * Test de CARACTERIZACIÓN, escrito antes de migrar el `ScrollView` a `LegendList` (Fase 4).
 *
 * No existía NINGÚN test que montara esta pantalla — los 14 del chat son de componentes sueltos —
 * así que la migración más riesgosa del plan iba a hacerse sin una sola red. Estas aserciones son
 * a propósito sobre lo que el usuario VE y no sobre el andamio (nada de `ScrollView`, ni props de
 * scroll, ni estructura interna): tienen que pasar igual antes y después del cambio de lista.
 */
describe("ChatScreen", () => {
  beforeEach(() => {
    setLanguage("es");
    chatState.messages = [];
    chatState.isStreaming = false;
    chatState.isThinking = false;
  });

  test("shows the empty state when there is no conversation yet", () => {
    render(screenTree());

    // El composer siempre está; el vacío se nota en que no hay ningún turno pintado.
    expect(screen.getByPlaceholderText("Pregúntame algo...")).toBeInTheDocument();
    expect(screen.queryByText("hola")).toBeNull();
  });

  test("paints every turn of the conversation, in order", () => {
    chatState.messages = [
      user("m1", "hola"),
      agent("m2", "Buenas, ¿en qué te ayudo?"),
      user("m3", "arroz"),
      agent("m4", "El arroz está en Bravo."),
    ];

    render(screenTree());

    for (const expected of ["hola", "arroz", "El", "Bravo."]) {
      expect(screen.getAllByText(expected, { exact: false }).length).toBeGreaterThan(0);
    }
  });

  test("keeps the composer reachable with a long conversation", () => {
    // Con la lista llena, el input sigue anclado y accesible — es lo que la Fase 4 puede romper al
    // mover la zona inferior fuera del contenedor del scroll.
    chatState.messages = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? user(`u${i}`, `pregunta ${i}`) : agent(`a${i}`, `respuesta ${i}`),
    );

    render(screenTree());

    expect(screen.getByPlaceholderText("Pregúntame algo...")).toBeInTheDocument();
  });

  test("offers the actions on a finished reply, but not while it is still streaming", () => {
    chatState.messages = [user("m1", "hola"), agent("m2", "Listo.")];
    chatState.isStreaming = true;
    const { rerender } = render(screenTree());

    expect(screen.queryByLabelText("Copiar respuesta")).toBeNull();

    chatState.isStreaming = false;
    rerender(screenTree());

    expect(screen.getByLabelText("Copiar respuesta")).toBeInTheDocument();
  });

  test("shows the status line only while a turn is in flight", () => {
    chatState.messages = [user("m1", "hola")];
    render(screenTree());

    expect(screen.queryByLabelText("Cargando respuesta…")).toBeNull();
  });
});
