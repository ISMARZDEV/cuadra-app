import * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from "lucide-react";

// Adaptado del registry Base UI (base-vega/sonner): el original usa `next-themes` (Next.js) y un
// `IconPlaceholder` interno de la doc site de shadcn — ninguno existe en este stack (Vike, sin
// next-themes). El tema claro/oscuro en `apps/web` se resuelve alternando la clase `.dark` en
// `<html>` (ver `src/components/layout/theme-toggle.tsx`), no con un context provider; por eso acá
// leemos la clase directamente y observamos sus cambios. Íconos: lucide-react (convención del
// proyecto), no la librería multi-icon-set del registry original.
function useDomTheme(): "light" | "dark" {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDomTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
