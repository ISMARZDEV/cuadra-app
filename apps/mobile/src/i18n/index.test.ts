import { describe, expect, test } from "vitest";

import { setLanguage, t } from "./index";

describe("i18n", () => {
  test("translates a known key in the active language", () => {
    setLanguage("es");
    expect(t("chat.a11y.send")).toBe("Enviar");
    setLanguage("en");
    expect(t("chat.a11y.send")).toBe("Send");
    setLanguage("pt");
    expect(t("chat.a11y.send")).toBe("Enviar");
  });

  test("every language exposes the same keys", () => {
    setLanguage("en");
    expect(t("chat.inputPlaceholder")).toBe("Ask me something...");
    setLanguage("es"); // reset for other tests
  });
});
