import { Popover } from "@base-ui/react/popover";
import type { TaxonomyLeafDto } from "@cuadra/api-client";
import { Check, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import type { Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";

/**
 * Selector de categoría anclado a un disparador compacto (un badge en una celda o en una fila).
 *
 * Vive aparte porque lo usan DOS sitios con comportamientos distintos: la celda de la tabla
 * (persiste con la API, optimista) y las filas del diálogo de canonización (solo estado local hasta
 * confirmar). La INTERACCIÓN es la misma en los dos, y tener dos comboboxes que se ven parecido
 * pero se comportan distinto es como se empiezan a divergir.
 *
 * No es `FilterSearchSelect`: aquel es un CAMPO de formulario ancho, correcto en un panel de
 * filtros y desproporcionado dentro de una fila densa. Acá el disparador es el propio badge.
 */
export function CategoryPicker({
  leaves,
  selectedTopName,
  onPick,
  disabled = false,
  label,
  locale,
  children,
}: {
  leaves: TaxonomyLeafDto[];
  /** Nombre del TOPE actualmente aplicado, para marcar la fila elegida con el check. */
  selectedTopName?: string | null;
  onPick: (leaf: TaxonomyLeafDto) => void;
  disabled?: boolean;
  /** Etiqueta accesible del disparador. */
  label: string;
  locale: Locale;
  /** El disparador: normalmente un `CategoryBadge`. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leaves;
    // Se busca sobre "Tope › Hoja" entero: el operador tanto escribe "cerveza" como "alcohol".
    return leaves.filter((l) => `${l.top_name} ${l.name}`.toLowerCase().includes(q));
  }, [leaves, query]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger
        disabled={disabled || leaves.length === 0}
        aria-haspopup="dialog"
        aria-label={label}
        className="rounded-full transition-transform duration-150 not-disabled:hover:opacity-80 not-disabled:active:scale-[0.97] disabled:cursor-default"
      >
        {children}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-[60]">
          <Popover.Popup className="w-[280px] overflow-hidden rounded-2xl bg-card text-card-foreground shadow-xl ring-1 ring-border transition duration-150 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={translate(locale, "admin.reviewQueue.category.search")}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* 120 hojas no caben: la lista scrollea y la búsqueda es el camino real. */}
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.map((leaf) => (
                <li key={leaf.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(leaf);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <Check
                      className={`size-3.5 shrink-0 text-brand-forest dark:text-brand-lime ${
                        selectedTopName === leaf.top_name ? "" : "invisible"
                      }`}
                    />
                    {/* El TOPE atenuado y la HOJA en negro: "Arroz" a secas no dice bajo qué
                        categoría cae, y hay hojas homónimas de topes distintos. */}
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{leaf.top_name} › </span>
                      <span className="text-foreground">{leaf.name}</span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  {translate(locale, "admin.reviewQueue.category.noMatch")}
                </li>
              ) : null}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
