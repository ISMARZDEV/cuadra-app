import { useState } from "react";

const REASON_CODES = [
  { value: "different_size", label: "Tamaño distinto" },
  { value: "different_brand", label: "Marca distinta" },
  { value: "different_product", label: "Producto distinto" },
  { value: "other", label: "Otro" },
];

interface ReasonCodeSelectProps {
  onReject: (payload: { reasonCode: string; reasonNote: string }) => void;
  /** Texto del botón de submit — personalizable para el uso en bulk ("Rechazar seleccionados"). */
  submitLabel?: string;
}

// Defensa en profundidad (feature #9, anti-patrón documentado): el backend YA exige reason_code al
// rechazar (`ResolveReview`, batch 1b) — esta UI bloquea el submit ANTES de intentar una request
// condenada, en vez de dejar que el usuario descubra el 422 después de esperar el roundtrip.
//
// `id="reason-code-select"` (además del `data-testid`) es a propósito: el atajo de teclado `r`
// (`useKeyboardReview`, batch 2e) enfoca este control vía `document.getElementById` — el componente
// se mantiene "tonto" (no expone un ref imperativo), el hotkey solo lleva el foco, nunca envía nada.
export function ReasonCodeSelect({ onReject, submitLabel = "Rechazar" }: ReasonCodeSelectProps) {
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

  return (
    <div className="flex flex-col gap-2">
      <select
        id="reason-code-select"
        data-testid="reason-code-select"
        value={reasonCode}
        onChange={(e) => setReasonCode(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
      >
        <option value="">Elegir motivo…</option>
        {REASON_CODES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        data-testid="reason-note-input"
        value={reasonNote}
        onChange={(e) => setReasonNote(e.target.value)}
        placeholder="Nota (opcional)"
        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      {showError ? (
        <p data-testid="reason-code-error" className="text-xs text-destructive">
          Elige un motivo antes de rechazar.
        </p>
      ) : null}
      <button
        data-testid="reject-submit"
        type="button"
        onClick={handleSubmit}
        className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90"
      >
        {submitLabel}
      </button>
    </div>
  );
}
