// Guard de REGRESIÓN: `pages/admin/+Layout.clear.tsx` NO debe montar su propio `<ClerkShell>` — el
// `<ClerkProvider>` único vive en `pages/+Wrapper.tsx` (raíz, envuelve TODO el árbol, admin
// incluido). Este test hubiera fallado con el código previo (`pages/admin/+Layout.tsx` envolvía en
// `<ClerkShell>` además del que ya ponía `layouts/LayoutDefault.tsx`), que producía DOS
// `<ClerkProvider>` anidados y Clerk crasheaba `/admin/*` con pantalla en blanco.
//
// Batch 6 (wiring): el shell ahora envuelve todo en `SidebarProvider` (Base UI) y renderiza
// `AdminSidebar` + `SidebarInset` + `Toaster` — NINGUNO de estos es un ClerkProvider, así que la
// invariante de UN SOLO ClerkShell debe seguir sosteniéndose con el árbol nuevo (aserción explícita
// de conteo, no solo "not.toHaveBeenCalled").
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { clerkShellMock } = vi.hoisted(() => ({
  clerkShellMock: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-shell">{children}</div>
  )),
}));
vi.mock("@/components/layout/clerk-shell", () => ({ ClerkShell: clerkShellMock }));
vi.mock("vike-react/useData", () => ({
  useData: () => ({ capabilities: ["admin_save_matching_review", "admin_save_ingestion_ops"], locale: "es" }),
}));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/admin/review-queue" }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("sonner", () => ({
  toast: toastMock,
  Toaster: () => <div data-testid="sonner-toaster" />,
}));

import Layout from "../../pages/admin/+Layout.clear";

describe("pages/admin/+Layout.clear (subárbol /admin/* — sin chrome público, sin ClerkShell propio)", () => {
  it("NO monta ClerkShell — el ClerkProvider único llega vía +Wrapper (con SidebarProvider + AdminSidebar wireados)", () => {
    render(
      <Layout>
        <div data-testid="page">página admin</div>
      </Layout>,
    );

    // Invariante sagrada: EXACTAMENTE un ClerkShell, sin importar que el árbol ahora tenga
    // SidebarProvider/AdminSidebar/SidebarInset/Toaster de por medio.
    expect(clerkShellMock).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId("clerk-shell")).toHaveLength(0);

    // El contenido de la página sigue llegando (SidebarInset envuelve `children`).
    expect(screen.getByTestId("page")).toBeInTheDocument();

    // El sidebar real quedó wireado — no el `<aside>` hand-rolled viejo.
    expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBeInTheDocument();
    expect(screen.getByText("Cola de revisión")).toBeInTheDocument();

    // El Toaster (para los toasts WIP) se monta UNA vez.
    expect(screen.getAllByTestId("sonner-toaster")).toHaveLength(1);
  });
});
