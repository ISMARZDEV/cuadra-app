import { useState } from "react";

import { Bell, Calendar, Cloud, Moon, Plus, Sparkles, Sun, Video } from "lucide-react";

// Rail oscuro extremo-izquierdo del ecosistema aispace (Figma nodo 484:6497) — Batch 8. Está
// FUERA del scope original del sidebar (ver `docs/sdd/admin-sidebar-base-ui.md`, sección "Fuera de
// alcance"), pero el usuario lo pidió al ver el resultado. Es el shell del ECOSISTEMA (Cloud,
// Calendar, Meet, aispace, tema), no del admin de Cuadra — por eso vive fuera de `AdminSidebar`.
//
// Iconografía: Lucide monocromo, por decisión del usuario. Antes eran DOS PNG (`ecosystem-top` /
// `ecosystem-bottom`) que traían el verde `#06382c` HORNEADO en el bitmap. Eso funcionaba en tema
// claro —donde el contenedor es ese mismo verde— pero en oscuro el contenedor pasa a
// `dark:bg-[#1c1c1c]` y aparecían dos rectángulos verdes recortados sobre gris: el rail parecía
// cortarse a media altura. Con vectores el fondo lo pone SIEMPRE el contenedor, así que no hay
// costura posible en ningún tema. Coste asumido: se pierde el color de marca de Google y el
// logotipo de aispace (la "a") pasa a ser un `Sparkles` genérico.
//
// El cluster superior es DECORATIVO (`aria-hidden`), igual que cuando era una imagen con alt vacío:
// afordancias visuales del ecosistema sin destino implementado, y exponerlas como botones sería
// inventar siete controles muertos. El único control real es el toggle de tema del pie, que REUSA
// la misma lógica que `components/layout/theme-toggle.tsx` (alternar `.dark` en `<html>` +
// persistir en localStorage) en vez de reimplementar un sistema de temas nuevo.
const ECOSYSTEM_APPS = [Cloud, Calendar, Video];

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

  // El icono OFRECE el destino, no describe el estado actual: en claro se muestra la luna (ir a
  // oscuro). El PNG anterior horneaba ambos símbolos a la vez y no comunicaba nada.
  const ThemeIcon = dark ? Sun : Moon;

  return (
    <aside
      className="hidden md:flex w-[70px] shrink-0 sticky top-0 self-start h-screen flex-col items-center justify-between bg-[#06382c] dark:bg-[#1c1c1c] pt-[26px] pb-[20px]"
      aria-label="aispace ecosystem"
    >
      <div className="flex flex-col items-center gap-6" aria-hidden="true">
        {/* Crear: círculo punteado, la única forma "abierta" del rail — señala que aún no hay
            destino, a diferencia de los cuadros sólidos de las apps ya conectadas. */}
        <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-white/40 text-white/80">
          <Plus className="size-5" />
        </span>

        {ECOSYSTEM_APPS.map((Icon, i) => (
          <Icon key={i} className="size-6 text-white/70" strokeWidth={1.75} />
        ))}

        {/* Notificaciones: conserva el bloque lima y el punto rojo del diseño original — es el
            único ítem del cluster con estado, y perderlo lo aplanaría con las apps. */}
        <span className="relative flex size-9 items-center justify-center rounded-xl bg-brand-lime text-[#06382c]">
          <Bell className="size-5" strokeWidth={2} />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
        </span>

        {/* Separador: divide el ecosistema Google de aispace. */}
        <span className="h-1 w-5 rounded-full bg-white/25" />

        <Sparkles className="size-8 text-brand-lime" strokeWidth={1.5} />
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className="flex size-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime"
      >
        <ThemeIcon className="size-5" strokeWidth={1.75} />
      </button>
    </aside>
  );
}
