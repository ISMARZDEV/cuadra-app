import { Check, ChevronDown, Search } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface FilterSearchSelectOption {
  value: string;
  label: string;
  /** Nodo opcional a la izquierda del label (p.ej. el logo del proveedor). */
  icon?: ReactNode;
}

export interface FilterSearchSelectProps {
  /** Valor seleccionado. `undefined` = opción "todos" (`allLabel`). */
  value?: string;
  onChange: (value: string | undefined) => void;
  options: FilterSearchSelectOption[];
  /** Placeholder del input de búsqueda (p.ej. "Buscar proveedor..."). */
  placeholder: string;
  /** Etiqueta de la opción "todos" (primera de la lista, con check cuando `value` es undefined). */
  allLabel: string;
  id?: string;
}

/**
 * Combobox buscable reutilizable: un input con lupa + chevron que despliega una lista filtrable.
 * La primera fila es la opción "todos"; la seleccionada se resalta en verde con check. Sin
 * dependencias extra — filtrado client-side + cierre por click-outside. Pensado para el filtro de
 * Proveedor pero sirve para cualquier lista (marcas, categorías, tiendas…) en futuras tablas.
 */
export function FilterSearchSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel,
  id,
}: FilterSearchSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = value
    ? (options.find((o) => o.value === value)?.label ?? value)
    : allLabel;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Cierre por click-outside (el modal no captura estos clics porque la lista es hija del campo).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function select(next: string | undefined) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          // Mismas clases que el `SelectTrigger` (Método/Orden) para que sea idéntico: borde
          // `border-input`, fondo `bg-card`, `shadow-xs` y el mismo anillo de foco.
          "flex h-11 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm shadow-xs transition-[color,box-shadow]",
          open && "border-ring ring-[3px] ring-ring/50",
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-listbox`}
          autoComplete="off"
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={open ? query : value ? selectedLabel : ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
        />
        <button
          type="button"
          aria-label={placeholder}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-muted-foreground"
        >
          <ChevronDown
            className={cn("size-4 opacity-50 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open ? (
        <ul
          id={`${inputId}-listbox`}
          role="listbox"
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          <FilterOptionRow
            label={allLabel}
            selected={value === undefined}
            onSelect={() => select(undefined)}
          />
          {filtered.map((o) => (
            <FilterOptionRow
              key={o.value}
              label={o.label}
              icon={o.icon}
              selected={o.value === value}
              onSelect={() => select(o.value)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FilterOptionRow({
  label,
  icon,
  selected,
  onSelect,
}: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          selected
            ? "bg-brand-lime/20 font-medium text-brand-forest dark:bg-brand-lime/15 dark:text-brand-lime"
            : "text-foreground hover:bg-muted",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon ? <span className="flex h-5 w-8 shrink-0 items-center justify-center">{icon}</span> : null}
          <span className="truncate">{label}</span>
        </span>
        {selected ? <Check className="size-4 shrink-0" /> : null}
      </button>
    </li>
  );
}
