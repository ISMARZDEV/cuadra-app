import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AgentBubble } from "./agent-bubble";

describe("AgentBubble", () => {
  test("renders the title and all text segments", () => {
    render(
      <AgentBubble
        title="Hey, Sure."
        segments={[{ text: "I can help you store your " }, { text: "receipts securely", bold: true }]}
      />,
    );

    expect(screen.getByText("Hey, Sure.")).toBeInTheDocument();
    expect(screen.getByText("I can help you store your")).toBeInTheDocument();
    expect(screen.getByText("receipts securely")).toBeInTheDocument();
  });

  test("renders without a title (agent note)", () => {
    render(<AgentBubble segments={[{ text: "Ok, send me the receipt..." }]} />);

    expect(screen.getByText("Ok, send me the receipt...")).toBeInTheDocument();
  });
});
