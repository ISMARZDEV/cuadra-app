import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

import { HubScreen } from "./hub-screen";

describe("HubScreen", () => {
  beforeEach(() => {
    setLanguage("es");
    push.mockClear();
  });

  test("muestra las cuatro verticales de Save", () => {
    render(<HubScreen />);

    expect(screen.getByText("Supermarket")).toBeInTheDocument();
    expect(screen.getByText("Credit Cards")).toBeInTheDocument();
    expect(screen.getByText("Loans & Insurance")).toBeInTheDocument();
    expect(screen.getByText("Investments")).toBeInTheDocument();
  });

  test("Promotions NO es una vertical: es una capa transversal", () => {
    render(<HubScreen />);

    expect(screen.queryByText("Promotions")).toBeNull();
  });

  test("la campana lleva al feed de alertas — que dejó de ser la pantalla de Save", () => {
    render(<HubScreen />);

    fireEvent.click(screen.getByLabelText("Alertas de precio"));

    expect(push).toHaveBeenCalledWith("/save/alerts");
  });

  test("la vertical con datos navega a su stack", () => {
    render(<HubScreen />);

    fireEvent.click(screen.getByText("Supermarket"));

    expect(push).toHaveBeenCalledWith("/save/supermarket");
  });

  test("una vertical sin datos NO navega — no manda a una pantalla vacía", () => {
    render(<HubScreen />);

    fireEvent.click(screen.getByText("Credit Cards"));

    expect(push).not.toHaveBeenCalled();
  });
});
