import { useState } from "react";
import { FolderPlus, Sparkles } from "lucide-react";

import { parseSize } from "../../lib/parse-size";

// Medidas del `Quantity` del dominio (create-canonical: quantity_measure). El revisor confirma/corrige.
export type Measure = "mass" | "volume" | "count";
const MEASURES: { value: Measure; label: string }[] = [
  { value: "mass", label: "Masa (g, kg, lb, oz)" },
  { value: "volume", label: "Volumen (ml, L)" },
  { value: "count", label: "Unidad (conteo)" },
];
const VOLUME_UNITS = /^(ml|l|lt|lts|litro|litros|cc)$/i;
const MASS_UNITS = /^(g|gr|gramo|gramos|kg|kgs|lb|lbs|libra|libras|oz|onza|onzas)$/i;
function guessMeasure(unit: string | null): Measure {
  if (unit && VOLUME_UNITS.test(unit)) return "volume";
  if (unit && MASS_UNITS.test(unit)) return "mass";
  return "count";
}

export interface CreateCanonicalPayload {
  name: string;
  brand: string;
  quantityAmount: number;
  quantityMeasure: Measure;
  taxonomyNodeId: string;
}

export interface CreateCanonicalPanelProps {
  defaultName: string | null;
  defaultBrand: string | null;
  defaultSizeText: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  onCreate: (payload: CreateCanonicalPayload) => void;
  disabled?: boolean;
}

// Zona "crear canónico" del detalle (Etapa A): cuando NINGÚN candidato es correcto pero el producto
// SÍ debe existir, se crea un canonical_product nuevo y se enlaza. La categoría por defecto es la
// SUGERIDA por la clasificación (Etapa B) — un canónico NUNCA puede quedar sin categoría, así que si
// no hay sugerencia el botón se bloquea (el override manual de categoría es un follow-up).
export function CreateCanonicalPanel({
  defaultName,
  defaultBrand,
  defaultSizeText,
  suggestedCategoryId,
  suggestedCategoryName,
  onCreate,
  disabled,
}: CreateCanonicalPanelProps) {
  const parsed = parseSize(defaultSizeText);
  const [name, setName] = useState(defaultName ?? "");
  const [brand, setBrand] = useState(defaultBrand ?? "");
  const [amount, setAmount] = useState(parsed.amount ?? "");
  const [measure, setMeasure] = useState<Measure>(guessMeasure(parsed.unit));
  const [showError, setShowError] = useState(false);

  const amountNum = Number.parseFloat(amount.replace(",", "."));
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const valid = name.trim() !== "" && amountValid && !!suggestedCategoryId;

  const handleSubmit = () => {
    if (!valid) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onCreate({
      name: name.trim(),
      brand: brand.trim(),
      quantityAmount: amountNum,
      quantityMeasure: measure,
      taxonomyNodeId: suggestedCategoryId as string,
    });
  };

  const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 aria-invalid:border-rose-400";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <FolderPlus className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">
            ¿Ninguno es correcto pero el producto existe?
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Crea un producto canónico nuevo con estos datos y enlaza este match. La categoría sale de
            la clasificación automática.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cc-name" className="text-xs font-medium text-foreground">
            Nombre <span className="text-emerald-600">*</span>
          </label>
          <input
            id="cc-name"
            data-testid="cc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={showError && name.trim() === ""}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cc-brand" className="text-xs font-medium text-foreground">
            Marca
          </label>
          <input
            id="cc-brand"
            data-testid="cc-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cc-amount" className="text-xs font-medium text-foreground">
            Tamaño <span className="text-emerald-600">*</span>
          </label>
          <input
            id="cc-amount"
            data-testid="cc-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={showError && !amountValid}
            className={`${field} tabular-nums`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cc-measure" className="text-xs font-medium text-foreground">
            Unidad de medida
          </label>
          <select
            id="cc-measure"
            data-testid="cc-measure"
            value={measure}
            onChange={(e) => setMeasure(e.target.value as Measure)}
            className={field}
          >
            {MEASURES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Categoría sugerida (Etapa B). Sin sugerencia → aviso + botón bloqueado. */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-background/60 px-3 py-2.5 text-sm dark:border-emerald-500/20">
        <Sparkles className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        {suggestedCategoryId ? (
          <span className="text-foreground" data-testid="cc-category">
            Categoría: <span className="font-semibold">{suggestedCategoryName ?? "—"}</span>{" "}
            <span className="text-muted-foreground">(sugerida)</span>
          </span>
        ) : (
          <span className="text-muted-foreground" data-testid="cc-category-missing">
            Sin categoría sugerida — clasifica el producto antes de crear el canónico.
          </span>
        )}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-emerald-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/20">
        {showError ? (
          <p role="alert" data-testid="cc-error" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            Completa nombre, tamaño y asegúrate de tener una categoría sugerida.
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          data-testid="cc-submit"
          disabled={disabled || !suggestedCategoryId}
          onClick={handleSubmit}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FolderPlus className="size-4" aria-hidden="true" />
          Crear canónico y enlazar
        </button>
      </div>
    </section>
  );
}
