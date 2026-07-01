import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// Mock the boundaries: the language store and the router. The screen owns composition; the
// persisted store (SecureStore + i18n) and navigation are stubbed.
const mockSetAuto = vi.fn();
const mockSetLang = vi.fn();
const mockBack = vi.fn();
let storeState = { auto: true, lang: "es", setAuto: mockSetAuto, setLang: mockSetLang };

vi.mock("./use-language-store", () => ({
  useLanguageStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: unknown }) => children,
}));

import { LanguageScreen } from "./language-screen";

describe("LanguageScreen", () => {
  beforeEach(() => {
    mockSetAuto.mockClear();
    mockSetLang.mockClear();
    mockBack.mockClear();
    storeState = { auto: true, lang: "es", setAuto: mockSetAuto, setLang: mockSetLang };
    setLanguage("es"); // deterministic labels
  });

  test("with auto ON, the manual language options are hidden", () => {
    render(<LanguageScreen />);
    expect(screen.queryByLabelText("Español")).toBeNull();
    expect(screen.queryByLabelText("English")).toBeNull();
  });

  test("toggling the auto switch off calls setAuto(false)", () => {
    render(<LanguageScreen />);
    fireEvent.click(screen.getByLabelText("Detectar automáticamente"));
    expect(mockSetAuto).toHaveBeenCalledWith(false);
  });

  test("with auto OFF, options show and selecting one calls setLang", () => {
    storeState = { ...storeState, auto: false };
    render(<LanguageScreen />);
    expect(screen.getByLabelText("Español")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("English"));
    expect(mockSetLang).toHaveBeenCalledWith("en");
  });

  test("with auto OFF, the current language is marked selected", () => {
    storeState = { ...storeState, auto: false, lang: "es" };
    render(<LanguageScreen />);
    expect(screen.getByLabelText("Español").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("English").getAttribute("aria-checked")).toBe("false");
  });

  test("the back control navigates back", () => {
    render(<LanguageScreen />);
    fireEvent.click(screen.getByLabelText("Volver"));
    expect(mockBack).toHaveBeenCalled();
  });
});
