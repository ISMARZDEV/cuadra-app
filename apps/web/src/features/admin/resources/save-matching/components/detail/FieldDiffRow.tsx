import { diffField } from "../../lib/field-diff";
import type { FieldDiffRowProps } from "./interfaces";

// Estilo del badge por resultado del diff — color + TEXTO ("Coincide"/"Diferente"), nunca color solo
// (regla a11y `color-not-only`). Módulo-scope (no inline dentro del componente).
const BADGE = {
  match: {
    label: "Coincide",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  differ: {
    label: "Diferente",
    className: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  },
} as const;

// Una fila de comparación campo-a-campo dentro de una `CandidateCard` (rediseño del detalle). El
// subtexto "store ≠ candidato" solo aparece cuando difiere Y `showValues` (los nombres largos lo
// omiten, como en el diseño). Reusa `diffField` (casefold+trim) — misma lógica que la tabla vieja.
export function FieldDiffRow({ label, storeValue, candidateValue, showValues }: FieldDiffRowProps) {
  const diff = diffField(storeValue, candidateValue);
  const badge = BADGE[diff];

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      {showValues && diff === "differ" ? (
        <p className="text-xs text-muted-foreground">
          {storeValue ?? "—"} ≠ {candidateValue ?? "—"}
        </p>
      ) : null}
    </div>
  );
}
