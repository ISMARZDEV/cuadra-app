import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mismo patrón que `ReviewQueueListScreen.test.tsx`: mockear `vike-react/usePageContext` para
// controlar `urlPathname` (estado activo). `sonner` se mockea para espiar el toast WIP sin montar
// el <Toaster/> real (eso es responsabilidad de `AdminLayout`, Batch 6).
let mockUrlPathname = "/admin/review-queue";
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: mockUrlPathname }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { SidebarProvider } from "@/components/ui-base/sidebar";
import { AdminSidebar } from "./AdminSidebar";

const FULL_CAPABILITIES = ["admin_save_matching_review", "admin_save_ingestion_ops"];

function renderSidebar({
  capabilities = FULL_CAPABILITIES,
  locale = "es" as const,
}: { capabilities?: string[]; locale?: "es" | "en" | "pt" } = {}) {
  return render(
    <SidebarProvider>
      <AdminSidebar capabilities={capabilities} locale={locale} />
    </SidebarProvider>,
  );
}

describe("AdminSidebar", () => {
  beforeEach(() => {
    mockUrlPathname = "/admin/review-queue";
    toastMock.mockReset();
  });

  it("5.1 renders the header logo image, collapse button, section labels and footer", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBeInTheDocument();

    // Batch 7: el wordmark "CUA"/"DRA" hand-rolled se reemplaza por el logo real exportado del
    // Figma (`cuadra-logo.png`), renderizado como <img alt="Cuadra">.
    const logo = screen.getByAltText(/cuadra/i);
    expect(logo.tagName).toBe("IMG");

    // Section labels (namespace admin.nav.section.*) — algunas cadenas se repiten como sub-ítem
    // WIP del grupo Dashboard (p.ej. "Usuarios"/"Noticias"/"Save"), por eso se usa getAllByText.
    expect(screen.getAllByText("Menú").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Usuarios").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Noticias").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Save").length).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: "Feedback" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ayuda" })).toBeInTheDocument();
  });

  it("5.6a sub-items render without a bullet (no list-disc, no literal bullet glyph)", () => {
    renderSidebar();

    const subItemLabel = screen.getByText("Cola de revisión");
    const list = subItemLabel.closest("ul");
    expect(list).not.toBeNull();
    expect(list).not.toHaveClass("list-disc");
    expect(list?.textContent).not.toContain("•");
  });

  it("5.6b collapsed sidebar hides group labels/sub-items but keeps the group icon", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <AdminSidebar capabilities={FULL_CAPABILITIES} locale="es" />
      </SidebarProvider>,
    );

    // Labels/sub-items se ocultan con transición en modo icon-only (siguen en el DOM con opacity-0)…
    expect(screen.queryByText("Supermercado")?.closest("[class*='opacity-0']")).toBeTruthy();
    expect(screen.queryByText("Cola de revisión")?.closest("[class*='opacity-0']")).toBeTruthy();
    expect(screen.queryByText("Menú")?.closest("[class*='opacity-0']")).toBeTruthy();

    // …pero el ícono del grupo se sigue renderizando.
    expect(screen.getByTestId("admin-nav-icon-supermercado")).toBeInTheDocument();
  });

  it("5.2 Supermercado arranca ABIERTO (defaultOpen del Figma) y el clic lo cierra", () => {
    renderSidebar();

    // Sub-items VISIBLES al inicio (Supermercado defaultOpen: true, como en el Figma)
    expect(screen.queryByText("Cola de revisión")?.closest("[class*='opacity-0']")).toBeFalsy();
    expect(screen.queryByText("Proveedores")?.closest("[class*='opacity-0']")).toBeFalsy();

    fireEvent.click(screen.getByRole("button", { name: /Supermercado/ }));

    // Ahora ocultos (el grupo se colapsa → max-h-0 opacity-0)
    expect(screen.queryByText("Cola de revisión")?.closest("[class*='opacity-0']")).toBeTruthy();
    expect(screen.queryByText("Proveedores")?.closest("[class*='opacity-0']")).toBeTruthy();
  });

  it("5.3 marks the sub-item matching urlPathname as active (pill), others stay inactive", () => {
    mockUrlPathname = "/admin/review-queue";
    renderSidebar();

    const activeLink = screen.getByText("Cola de revisión").closest("a");
    expect(activeLink).not.toBeNull();
    const activePill = activeLink!.querySelector("span");
    expect(activePill).toHaveClass("bg-sidebar-accent");
    expect(activePill).toHaveClass("border-sidebar-accent-border");
    expect(activePill).toHaveClass("font-bold");

    const inactiveLink = screen.getByText("Proveedores").closest("a");
    expect(inactiveLink?.querySelector("span")).not.toHaveClass("bg-sidebar-accent");
  });

  it("5.4 hides ingestion-ops-gated sub-items without the capability, shows them with it", () => {
    renderSidebar({ capabilities: ["admin_save_matching_review"] });

    expect(screen.getByText("Cola de revisión")).toBeInTheDocument();
    expect(screen.queryByText("Proveedores")).not.toBeInTheDocument();
    expect(screen.queryByText("Fuentes")).not.toBeInTheDocument();
    expect(screen.queryByText("Canasta curada")).not.toBeInTheDocument();

    renderSidebar({ capabilities: FULL_CAPABILITIES });

    expect(screen.getAllByText("Proveedores").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fuentes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Canasta curada").length).toBeGreaterThan(0);
  });

  it("5.5 clicking a WIP sub-item fires the toast and never renders an <a href>", () => {
    renderSidebar();

    const metrics = screen.getByText("Métricas");
    expect(metrics.closest("a")).toBeNull();

    fireEvent.click(metrics);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("5.5b clicking an empty WIP group (no sub-items) also fires the toast", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Soporte a usuarios/ }));
    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});
