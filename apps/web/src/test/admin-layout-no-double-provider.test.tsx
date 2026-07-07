// Guard de REGRESIÓN: `pages/admin/+Layout.clear.tsx` NO debe montar su propio `<ClerkShell>` — el
// `<ClerkProvider>` único vive en `pages/+Wrapper.tsx` (raíz, envuelve TODO el árbol, admin
// incluido). Este test hubiera fallado con el código previo (`pages/admin/+Layout.tsx` envolvía en
// `<ClerkShell>` además del que ya ponía `layouts/LayoutDefault.tsx`), que producía DOS
// `<ClerkProvider>` anidados y Clerk crasheaba `/admin/*` con pantalla en blanco.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { clerkShellMock } = vi.hoisted(() => ({
  clerkShellMock: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-shell">{children}</div>
  )),
}));
vi.mock("@/components/layout/clerk-shell", () => ({ ClerkShell: clerkShellMock }));
vi.mock("vike-react/useData", () => ({ useData: () => ({ capabilities: ["save.review_queue"] }) }));

import Layout from "../../pages/admin/+Layout.clear";

describe("pages/admin/+Layout.clear (subárbol /admin/* — sin chrome público, sin ClerkShell propio)", () => {
  it("NO monta ClerkShell — el ClerkProvider único llega vía +Wrapper", () => {
    render(
      <Layout>
        <div data-testid="page">página admin</div>
      </Layout>,
    );

    expect(clerkShellMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });
});
