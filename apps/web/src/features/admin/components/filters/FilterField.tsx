import type * as React from "react";

import { cn } from "@/lib/utils";

export interface FilterFieldProps {
  /** Ícono verde a la izquierda del label (Store, Settings, ArrowUpDown, BarChart3…). */
  icon?: React.ReactNode;
  label: string;
  /** Enlaza el label con el control (accesibilidad). */
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Sección etiquetada de un filtro dentro de `FilterModal`: label en negrita con ícono verde +
 * control debajo. Reutilizable por cualquier tabla. `className` permite spans de columna
 * (p.ej. `col-span-2`) cuando el modal usa una grilla.
 */
export function FilterField({ icon, label, htmlFor, children, className }: FilterFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        {icon ? (
          <span className="text-brand-forest [&_svg]:size-[18px] dark:text-brand-lime">{icon}</span>
        ) : null}
        {label}
      </label>
      {children}
    </div>
  );
}
