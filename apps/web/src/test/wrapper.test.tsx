// Guard de REGRESIÓN: `pages/+Wrapper.tsx` es el ÚNICO punto de montaje de `<ClerkShell>` (y por
// tanto de `<ClerkProvider>`) de toda la app — `Wrapper` es una config de Vike que envuelve TODOS
// los `+Layout` (público Y admin) una sola vez, a diferencia de `Layout`, que anida por nivel de
// ruta (ver vike.dev/Wrapper). Si `ClerkShell` se vuelve a montar en un `+Layout` individual además
// de aquí, Clerk lanza "multiple <ClerkProvider>" y la página crashea en blanco — este test
// hubiera fallado con el código previo, que montaba `ClerkShell` en `layouts/LayoutDefault.tsx` Y
// en `pages/admin/+Layout.tsx` simultáneamente.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { clerkShellMock } = vi.hoisted(() => ({
  clerkShellMock: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-shell">{children}</div>
  )),
}));
vi.mock("@/components/layout/clerk-shell", () => ({ ClerkShell: clerkShellMock }));

import Wrapper from "../../pages/+Wrapper";

describe("pages/+Wrapper (raíz — envuelve todo el árbol una sola vez)", () => {
  it("monta ClerkShell exactamente una vez, envolviendo a los children", () => {
    render(
      <Wrapper>
        <div data-testid="child">contenido</div>
      </Wrapper>,
    );

    expect(clerkShellMock).toHaveBeenCalledTimes(1);
    const shell = screen.getByTestId("clerk-shell");
    expect(shell).toContainElement(screen.getByTestId("child"));
  });
});
