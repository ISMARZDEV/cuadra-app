import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { describe, expect, test } from "vitest";

import { InsightsCarousel } from "./insights-carousel";

describe("InsightsCarousel", () => {
  test("renders all child cards", () => {
    render(
      <InsightsCarousel>
        <Text>Card A</Text>
        <Text>Card B</Text>
        <Text>Card C</Text>
      </InsightsCarousel>,
    );

    expect(screen.getByText("Card A")).toBeInTheDocument();
    expect(screen.getByText("Card B")).toBeInTheDocument();
    expect(screen.getByText("Card C")).toBeInTheDocument();
  });

  test("scrolling does not crash", () => {
    render(
      <InsightsCarousel>
        <Text>Card A</Text>
        <Text>Card B</Text>
        <Text>Card C</Text>
      </InsightsCarousel>,
    );

    fireEvent.scroll(screen.getByTestId("insights-carousel-scroll"), {
      target: { scrollLeft: 300 },
    });
  });
});
