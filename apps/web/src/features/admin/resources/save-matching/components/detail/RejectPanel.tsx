import { useState } from "react";
import { ChevronDown, X, XCircle } from "lucide-react";

import { REASON_CODES } from "../../lib/reason-codes";
import type { RejectPanelProps } from "./interfaces";

const NOTE_MAX = 500;

// Zona de rechazo del detalle (rediseño). Reusa `REASON_CODES` (fuente única, compartida con el
// bulk-reject). El motivo es OBLIGATORIO: bloquea el submit ANTES de la request condenada (defensa en
// profundidad sobre el 422 del backend `ResolveReview`, NUNCA un bypass). El error va DEBAJO del campo
// con `role="alert"` (a11y). El `id="reason-code-select"` lo enfoca el atajo `r` (`useKeyboardReview`).
export function RejectPanel({ onReject, disabled }: RejectPanelProps) {
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [showError, setShowError] = useState(false);

  const handleSubmit = () => {
    if (!reasonCode) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onReject({ reasonCode, reasonNote });
  };

  const nearLimit = reasonNote.length >= NOTE_MAX;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-500/20 dark:bg-rose-500/5">
      {/* Header del "danger zone": ícono + prompt + subtítulo (jerarquía clara, ui-ux-pro-max §6). */}
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/15">
          <XCircle className="size-5 text-rose-500" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">¿Ningún candidato es correcto?</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rechaza el match y especifica el motivo. El match volverá a la cola para re-evaluación.
          </p>
        </div>
      </div>

      {/* Campos: dos columnas iguales, labels alineados arriba (ui-ux-pro-max §8 input-labels). */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason-code-select" className="text-xs font-medium text-foreground">
            Motivo del rechazo <span className="text-rose-500">*</span>
          </label>
          {/* `appearance-none` + chevron Lucide custom: la flecha nativa del navegador se ve fina e
              inconsistente con el diseño. */}
          <div className="relative">
            <select
              id="reason-code-select"
              data-testid="reason-code-select"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              aria-invalid={showError}
              className="h-11 w-full appearance-none rounded-lg border border-border bg-background pr-9 pl-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/40 aria-invalid:border-rose-400"
            >
              <option value="">Seleccionar motivo</option>
              {REASON_CODES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          {showError ? (
            <p role="alert" data-testid="reason-code-error" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              Elige un motivo antes de rechazar.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason-note-input" className="text-xs font-medium text-foreground">
            Nota (opcional)
          </label>
          <textarea
            id="reason-note-input"
            data-testid="reason-note-input"
            value={reasonNote}
            maxLength={NOTE_MAX}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Agrega detalles que puedan ayudar…"
            rows={1}
            className="h-11 min-h-11 resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/40"
          />
          <span
            className={`self-end text-[11px] tabular-nums ${nearLimit ? "font-semibold text-rose-500" : "text-muted-foreground"}`}
          >
            {reasonNote.length} / {NOTE_MAX}
          </span>
        </div>
      </div>

      {/* Action bar: caption a la izquierda, acción destructiva a la derecha, separada y enfatizada
          (ui-ux-pro-max §4 primary-action + §8 destructive-emphasis). */}
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-rose-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-rose-500/20">
        <p className="text-xs text-muted-foreground">
          El match será marcado como rechazado y no se enlazará a ningún producto.
        </p>
        <button
          type="button"
          data-testid="reject-submit"
          disabled={disabled}
          onClick={handleSubmit}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-4" aria-hidden="true" />
          Rechazar match
        </button>
      </div>
    </section>
  );
}
