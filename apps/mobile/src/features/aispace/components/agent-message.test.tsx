import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

import { AgentMessage } from "./agent-message";

describe("AgentMessage", () => {
  test("renders plain reply text when there is no href", () => {
    // StreamingText fades in per word → each word is its own node (no single full-string node).
    render(<AgentMessage text="gasto registrado" />);
    expect(screen.getByText("registrado")).toBeInTheDocument();
  });

  test("a markdown reply renders the **opener** as a heading + normal coaching, no ** markers", () => {
    render(<AgentMessage text={"**Wow!!! 🫣**\nEso es mucho dinero Ismael"} />);
    expect(screen.getByText("Wow!!! 🫣")).toBeInTheDocument();
    expect(screen.getByText("Eso es mucho dinero Ismael")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  test("an href turns the message into a deep link that navigates", () => {
    push.mockClear();
    render(<AgentMessage text="Ver en Insight" href="insights" />);
    fireEvent.click(screen.getByText("Ver en Insight"));
    expect(push).toHaveBeenCalledWith("/insights");
  });
});
