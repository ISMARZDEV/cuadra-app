import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProxiedImage } from "./ProxiedImage";

const authHeadersMock = vi.fn();
vi.mock("@/features/save/hooks/use-auth", () => ({ authHeaders: () => authHeadersMock() }));

vi.mock("@/lib/api", () => ({
  apiClient: { getConfig: () => ({ baseUrl: "http://localhost:8005" }) },
}));

describe("ProxiedImage", () => {
  beforeEach(() => {
    authHeadersMock.mockReset();
    authHeadersMock.mockResolvedValue({ Authorization: "Bearer token" });
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("muestra un placeholder mientras carga", () => {
    render(<ProxiedImage src="https://cdn/a.jpg" alt="A" />);
    expect(screen.getByRole("img", { name: "A" })).toHaveAttribute("aria-busy", "true");
  });

  it("renderiza la imagen como object URL tras fetch exitoso", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    } as unknown as Response);

    render(<ProxiedImage src="https://cdn/a.jpg" alt="A" />);

    await waitFor(() => expect(screen.getByRole("img", { name: "A" }).tagName).toBe("IMG"));
    const img = screen.getByRole("img", { name: "A" }) as HTMLImageElement;
    expect(img.src).toMatch(/^blob:/);
  });

  it("muestra fallback si el proxy falla", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    } as unknown as Response);

    render(<ProxiedImage src="https://cdn/a.jpg" alt="A" />);

    await waitFor(() => expect(screen.getByText("A")).toBeInTheDocument());
  });
});
