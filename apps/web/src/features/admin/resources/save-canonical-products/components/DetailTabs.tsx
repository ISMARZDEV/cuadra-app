import { FileText, ImageUp, Network, Presentation, ScrollText } from "lucide-react";
import { useRef } from "react";

import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

/** Las cinco secciones del detalle. El orden es el de la barra y el de las flechas. */
export type DetailTabId = "summary" | "categories" | "description" | "images" | "audit";

const TABS = [
  { id: "summary", label: "admin.canonicalDetail.tab.summary", Icon: Network },
  { id: "categories", label: "admin.canonicalDetail.tab.categories", Icon: FileText },
  { id: "description", label: "admin.canonicalDetail.tab.description", Icon: Presentation },
  { id: "images", label: "admin.canonicalDetail.tab.images", Icon: ImageUp },
  { id: "audit", label: "admin.canonicalDetail.tab.audit", Icon: ScrollText },
] as const satisfies ReadonlyArray<{ id: DetailTabId; label: MessageKey; Icon: unknown }>;

export const tabPanelId = (id: DetailTabId) => `canonical-detail-panel-${id}`;
export const tabId = (id: DetailTabId) => `canonical-detail-tab-${id}`;

/**
 * Barra de secciones del detalle canónico.
 *
 * La activa va en lima y las dormidas en verde profundo — al revés de la convención de "la
 * activa resalta sobre fondo claro". Es deliberado: las cinco son destinos, no estados de un
 * formulario, y el bloque oscuro las lee como una botonera sólida en vez de como pestañas
 * a medio apagar.
 */
export function DetailTabs({
  active,
  onChange,
  t,
}: {
  active: DetailTabId;
  onChange: (id: DetailTabId) => void;
  t: (key: MessageKey) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Flechas con vuelta en los extremos (patrón ARIA de tabs). Un tope mudo al final de la fila
  // se siente roto: el usuario repite la tecla sin entender por qué no pasa nada.
  const move = (delta: number) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    onChange(next.id);
    // El foco sigue a la selección, si no la próxima flecha sale del punto equivocado.
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(next.id))}`)
      ?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      move(step);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? TABS[0] : TABS[TABS.length - 1];
      onChange(target.id);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t("admin.canonicalDetail.tabs.label")}
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#eff7f4] p-1.5 dark:bg-white/5"
    >
      {TABS.map(({ id, label, Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabId(id)}
            aria-controls={tabPanelId(id)}
            aria-selected={selected}
            // Roving tabindex: una sola parada en la barra, el resto se alcanza con flechas.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex h-[34px] items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold",
              "transition-colors focus-visible:ring-2 focus-visible:ring-brand-lime",
              "focus-visible:outline-none",
              selected
                ? "bg-brand-green text-brand-forest"
                : "bg-[#0a4d3d] text-white/85 hover:bg-[#0a4d3d]/90",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(label)}
          </button>
        );
      })}
    </div>
  );
}
