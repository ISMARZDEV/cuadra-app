import { Dialog } from "@base-ui/react/dialog";
import { RotateCcw, X } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui-base/button";
import { cn } from "@/lib/utils";

export interface FilterModalProps {
  /** Modal controlado (el trigger — p.ej. el botón de embudo del toolbar — vive fuera). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Ícono del header (dentro del círculo lima). Cada tabla pasa el suyo. */
  icon?: React.ReactNode;
  /** Contenido: se compone con `FilterField` + controles (`FilterSearchSelect`, selects, sliders…). */
  children: React.ReactNode;
  onClear: () => void;
  onApply: () => void;
  clearLabel: string;
  applyLabel: string;
  /** Ícono opcional del botón "Aplicar" (p.ej. el embudo). */
  applyIcon?: React.ReactNode;
  className?: string;
}

/**
 * Shell reutilizable de modal de filtros para las tablas del admin (OFV). Estructura fija fiel al
 * diseño: header (ícono en círculo lima + título verde bosque + cerrar) · body scrollable con los
 * campos · footer con "Limpiar" (outline) y "Aplicar" (verde bosque). El estado draft y los campos
 * concretos los aporta el caller (una tabla compone su propio set) — este componente solo maqueta.
 */
export function FilterModal({
  open,
  onOpenChange,
  title,
  icon,
  children,
  onClear,
  onApply,
  clearLabel,
  applyLabel,
  applyIcon,
  className,
}: FilterModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-lime/25 text-brand-forest [&_svg]:size-5 dark:bg-brand-lime/15 dark:text-brand-lime">
              {icon}
            </span>
            <Dialog.Title className="text-xl font-bold text-brand-forest dark:text-brand-lime">
              {title}
            </Dialog.Title>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto rounded-full text-muted-foreground hover:text-foreground"
                />
              }
            >
              <X className="size-5" />
              <span className="sr-only">Cerrar</span>
            </Dialog.Close>
          </div>

          <div className="border-t border-border" />

          {/* Body */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">{children}</div>

          {/* Footer */}
          <div className="border-t border-border" />
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClear}
              className="gap-2 rounded-full border-border font-medium"
            >
              <RotateCcw className="size-4" />
              {clearLabel}
            </Button>
            <Button
              type="button"
              onClick={onApply}
              className="gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {applyIcon}
              {applyLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
