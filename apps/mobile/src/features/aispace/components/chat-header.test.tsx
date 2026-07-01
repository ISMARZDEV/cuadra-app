import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

const mockSetOpen = vi.fn();
const mockToggleExpanded = vi.fn();
let expanded = false;

vi.mock("@/store/drawer-store", () => ({
  useDrawer: () => ({ setOpen: mockSetOpen }),
}));
vi.mock("@/store/chat-expand-store", () => ({
  useChatExpandStore: (sel: (s: { expanded: boolean; toggle: () => void }) => unknown) =>
    sel({ expanded, toggle: mockToggleExpanded }),
}));

import { ChatHeader } from "./chat-header";

describe("ChatHeader", () => {
  beforeEach(() => {
    mockSetOpen.mockClear();
    mockToggleExpanded.mockClear();
    expanded = false;
    setLanguage("es");
  });

  test("menu button opens the sessions drawer", () => {
    render(<ChatHeader />);
    fireEvent.click(screen.getByLabelText("Abrir menú"));
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });

  test("collapsed: shows Expandir, tapping toggles expand", () => {
    render(<ChatHeader />);
    expect(screen.getByLabelText("Expandir")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Expandir"));
    expect(mockToggleExpanded).toHaveBeenCalledOnce();
  });

  test("expanded: shows Minimizar instead", () => {
    expanded = true;
    render(<ChatHeader />);
    expect(screen.getByLabelText("Minimizar")).toBeInTheDocument();
    expect(screen.queryByLabelText("Expandir")).not.toBeInTheDocument();
  });
});
