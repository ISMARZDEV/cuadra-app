import { useEffect } from "react";

export interface UseKeyboardReviewOptions {
  /** Aprueba el candidato TOP/primero (visible en pantalla) — la misma acción que su botón. */
  onApprove: () => void;
  /** Enfoca/abre el flujo de rechazo — NUNCA envía el rechazo directamente (el backend exige
   * reason_code; el hotkey solo lleva el foco al selector, igual que clickear en él). */
  onReject: () => void;
  /** Va al SIGUIENTE match pendiente (`nextMatchId` resuelto en el SSR); si no hay, cae a la lista. */
  onNext: () => void;
  /** Va al match ANTERIOR (`prevMatchId`); opcional (no-op si no se provee o no hay anterior). */
  onPrev?: () => void;
  /** Desactiva los atajos (p.ej. mientras hay un request en curso) — evita doble-submit. */
  disabled?: boolean;
}

// Aprobar/rechazar exigen el modificador Option/Alt (acciones consecuentes → no se disparan sin
// intención). Se comparan por `event.code` (físico) porque en macOS Option+A produce el carácter "å"
// en `event.key` — `code` sigue siendo "KeyA". Navegar (n/p, ←/→) va sin modificador (seguro).
const APPROVE_CODE = "KeyA";
const REJECT_CODE = "KeyR";
const NEXT_KEYS = new Set(["n", "ArrowRight"]);
const PREV_KEYS = new Set(["p", "ArrowLeft"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

// Atajos de teclado del revisor (feature de conveniencia, F2·B1 batch 2e): ⌥a=aprobar, ⌥r=enfocar
// rechazo, n/→=siguiente match, p/←=match anterior. SACRED (cuadra-save-matching): esto es conveniencia sobre el MISMO
// flujo de ResolveReview ya validado server-side — nunca una ruta de negocio nueva ni un bypass.
// Ignora el evento si el foco está en un campo de texto (p.ej. la nota de rechazo) para no pisar
// lo que el revisor está escribiendo.
export function useKeyboardReview({
  onApprove,
  onReject,
  onNext,
  onPrev,
  disabled = false,
}: UseKeyboardReviewOptions): void {
  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return;

      if (event.altKey && event.code === APPROVE_CODE) {
        event.preventDefault();
        onApprove();
      } else if (event.altKey && event.code === REJECT_CODE) {
        event.preventDefault();
        onReject();
      } else if (NEXT_KEYS.has(event.key)) {
        onNext();
      } else if (PREV_KEYS.has(event.key)) {
        onPrev?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onApprove, onReject, onNext, onPrev, disabled]);
}
