import { useState } from "react";

import ecosystemBottom from "./ecosystem-bottom.png";
import ecosystemTop from "./ecosystem-top.png";

// Rail oscuro extremo-izquierdo del ecosistema aispace (Figma nodo 484:6497) — Batch 8. Está
// FUERA del scope original del sidebar (ver `docs/sdd/admin-sidebar-base-ui.md`, sección "Fuera de
// alcance"), pero el usuario lo pidió al ver el resultado. Es el shell del ECOSISTEMA (Drive,
// Calendar, Meet, aispace, tema), no del admin de Cuadra — por eso vive fuera de `AdminSidebar` y
// SIEMPRE es oscuro (`bg-[#06382c]` — el verde oscuro REAL del rail en el Figma, el mismo que los
// PNG de los clusters traen horneado, para que no haya costura/rectángulo), sin seguir el tema
// claro/oscuro de la app (a diferencia del resto del shell, que sí lo sigue vía tokens `--sidebar-*`).
//
// El toggle de tema del pie REUSA la misma lógica que `components/layout/theme-toggle.tsx`
// (alternar `.dark` en `<html>` + persistir en localStorage) en vez de reimplementar un sistema de
// temas nuevo — hay UN solo mecanismo de tema en toda la app.
export function EcosystemRail() {
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage no disponible */
    }
  };

  return (
    <aside
      className="hidden md:flex w-[70px] shrink-0 sticky top-0 self-start h-screen flex-col items-center justify-between bg-[#06382c] pt-[26px] pb-[20px]"
      aria-label="aispace ecosystem"
    >
      <img src={ecosystemTop} alt="" className="w-[46px] h-auto select-none" />
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      >
        <img src={ecosystemBottom} alt="" className="w-[31px] h-auto" />
      </button>
    </aside>
  );
}
