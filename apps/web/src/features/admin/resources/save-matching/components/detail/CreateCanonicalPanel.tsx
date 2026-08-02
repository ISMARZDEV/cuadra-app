import { useState } from "react";
import { FolderPlus, Images, Sparkles } from "lucide-react";

import { parseSize } from "@/features/admin/lib/parse-size";

// UNIDADES reales, no medidas del dominio. El select pedía antes "Masa / Volumen / Unidad", y ese
// era el bug: "Volumen" no dice si 355 son mililitros o litros, así que el número se guardaba sin
// convertir (355 L en vez de 0.355 L). Acá se elige la unidad de verdad y el SERVIDOR hace la
// conversión con `parse_size` del dominio — el navegador nunca conoce los factores.
// Estos ocho tokens son los que emite `normalize_size_text` y acepta `parse_size`
// (apps/api/src/contexts/save/domain/value_objects/size_parser.py).
const UNIT_GROUPS: { label: string; units: string[] }[] = [
  { label: "Masa", units: ["Gr", "Kg", "Lb", "Oz"] },
  { label: "Volumen", units: ["Ml", "Lt", "Gl"] },
  { label: "Conteo", units: ["Un"] },
];

// Ortografía cruda de la tienda → token canónico. Espeja `_DISPLAY_UNIT` del backend. Es
// ORTOGRAFÍA, no conversión: no viola la doctrina, y si se desactualiza el servidor re-normaliza
// igual. Sólo sirve para preseleccionar el desplegable.
const UNIT_SPELLINGS: Record<string, string> = {
  lb: "Lb", lbs: "Lb", libra: "Lb", libras: "Lb",
  kg: "Kg", kgs: "Kg", kilo: "Kg", kilos: "Kg",
  g: "Gr", gr: "Gr", grs: "Gr", gramo: "Gr", gramos: "Gr",
  oz: "Oz", onz: "Oz", onza: "Oz", onzas: "Oz",
  l: "Lt", lt: "Lt", lts: "Lt", litro: "Lt", litros: "Lt",
  ml: "Ml",
  gl: "Gl", gal: "Gl", galon: "Gl", "galón": "Gl",
  und: "Un", un: "Un", u: "Un", uds: "Un", unidad: "Un", unidades: "Un",
  pza: "Un", pzas: "Un", pack: "Un",
};

/** Token canónico, o `""` si la tienda usó una unidad que el dominio no sabe convertir. */
function canonicalUnit(raw: string | null): string {
  if (!raw) return "";
  return UNIT_SPELLINGS[raw.trim().toLowerCase().replace(/\.$/, "")] ?? "";
}

export interface CreateCanonicalPayload {
  name: string;
  brand: string;
  /** Tamaño como TEXTO ("355 Ml"). El servidor lo convierte a unidad base con `parse_size`. */
  sizeText: string;
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
  // Si la tienda usó una unidad que el dominio no sabe convertir, el select llega VACÍO y el
  // operador tiene que elegir. Adivinar (lo que hacía `guessMeasure`, que caía en "conteo") es
  // cómo un producto termina con la medida equivocada sin que nadie se entere.
  const [unit, setUnit] = useState(canonicalUnit(parsed.unit));
  const [showError, setShowError] = useState(false);

  const amountNum = Number.parseFloat(amount.replace(",", "."));
  const hasSize = amount.trim() !== "";
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  // El tamaño es OPCIONAL: no todo producto lo declara (plato del mostrador, pan por pieza, fruta a
  // granel). Pero si el operador ESCRIBIÓ algo, tiene que ser un número válido con su unidad —
  // guardar "abc" en silencio sería peor que no pedirlo.
  const sizeOk = !hasSize || (amountValid && unit !== "");
  const valid = name.trim() !== "" && sizeOk && !!suggestedCategoryId;

  const handleSubmit = () => {
    if (!valid) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onCreate({
      name: name.trim(),
      brand: brand.trim(),
      // Texto, no cantidad: la conversión a unidad base es del servidor. Vacío = sin tamaño; el
      // backend lo persiste como ausencia en vez de inventar un número.
      sizeText: hasSize ? `${amount.trim().replace(",", ".")} ${unit}` : "",
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
            Tamaño
          </label>
          <input
            id="cc-amount"
            data-testid="cc-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={showError && hasSize && !amountValid}
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
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-invalid={showError && unit === ""}
            className={field}
          >
            <option value="">Selecciona una unidad…</option>
            {UNIT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </optgroup>
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

      {/* La herencia de la galería ocurre en el servidor (`CreateCanonicalAndLink`). Se anuncia acá
          porque un efecto invisible obliga al operador a ir al detalle a comprobar si pasó. */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-background/60 px-3 py-2.5 text-sm dark:border-emerald-500/20">
        <Images className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="text-muted-foreground" data-testid="cc-inherits-images">
          Las fotos que publicó el proveedor se heredarán automáticamente (hasta 10).
        </span>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-emerald-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/20">
        {showError ? (
          <p role="alert" data-testid="cc-error" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            Completa nombre, tamaño y unidad, y asegúrate de tener una categoría sugerida.
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
