import type { ComponentProps } from "react";

// Check EXACTO del Figma (nodo 484:7315, fileKey MJlNTbiNLuUl4ythDuAPDX): NO es el `Check` recto de
// lucide sino un trazo curvo con caps redondeados. `viewBox`, `d` (coords redondeadas a 2 decimales,
// corrimiento sub-pixel imperceptible), grosor y color (#237961 teal) del asset. El color es una
// marca → constante en ambos temas.
function FigmaCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 15.9058 15.9058" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.64 8.72C4.64 8.72 6.13 9.59 6.88 10.85C6.88 10.85 9.11 7.12 12.1 5.47"
        stroke="#237961"
        strokeWidth="1.65686"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Checkbox de la cola de revisión — fiel al Figma (imagen de referencia + nodo 484:7315): cuadro
// redondeado con corner-smoothing (squircle) tipo Apple, borde claro sin marcar; al marcar se rellena
// de `brand-lime` (#BBEC6C) con el check curvo teal encima. Mantiene un `<input type="checkbox">` REAL
// (accesible + testeable por `data-testid`/`checked`): el input va `sr-only` como `peer` y el cuadro
// visible reacciona con `peer-checked`. Los tamaños son idénticos en claro y oscuro; solo el
// borde/fondo del estado vacío se adapta por tema.
export type SelectCheckboxProps = Omit<ComponentProps<"input">, "type" | "className">;

export function SelectCheckbox(props: SelectCheckboxProps) {
  return (
    <label className="relative inline-flex cursor-pointer items-center has-[:disabled]:cursor-not-allowed">
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-[7px] border-[1.5px] border-[#d4d5e0] bg-white transition-colors [corner-shape:squircle] [&>svg]:size-4 [&>svg]:opacity-0 peer-checked:border-brand-lime peer-checked:bg-brand-lime peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-lime/50 peer-focus-visible:ring-offset-1 peer-disabled:opacity-40 dark:border-white/20 dark:bg-transparent dark:peer-checked:border-brand-lime dark:peer-checked:bg-brand-lime"
      >
        <FigmaCheck />
      </span>
    </label>
  );
}
