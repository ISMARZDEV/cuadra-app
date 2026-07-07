import { useEffect } from "react";

export interface UseKeyboardReviewOptions {
  /** Aprueba el candidato TOP/primero (visible en pantalla) — la misma acción que su botón. */
  onApprove: () => void;
  /** Enfoca/abre el flujo de rechazo — NUNCA envía el rechazo directamente (el backend exige
   * reason_code; el hotkey solo lleva el foco al selector, igual que clickear en él). */
  onReject: () => void;
  /** Sin contexto de "posición en la cola" todavía (F2·B1) — "siguiente" simplemente vuelve a la
   * lista, igual que la navegación post-resolve ya existente. */
  onNext: () => void;
  /** Desactiva los atajos (p.ej. mientras hay un request en curso) — evita doble-submit. */
  disabled?: boolean;
}

const APPROVE_KEY = "a";
const REJECT_KEY = "r";
const NEXT_KEYS = new Set(["n", "ArrowRight"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

// Atajos de teclado del revisor (feature de conveniencia, F2·B1 batch 2e): a=aprobar, r=enfocar
// rechazo, n/→=siguiente. SACRED (cuadra-save-matching): esto es conveniencia sobre el MISMO
// flujo de ResolveReview ya validado server-side — nunca una ruta de negocio nueva ni un bypass.
// Ignora el evento si el foco está en un campo de texto (p.ej. la nota de rechazo) para no pisar
// lo que el revisor está escribiendo.
export function useKeyboardReview({
  onApprove,
  onReject,
  onNext,
  disabled = false,
}: UseKeyboardReviewOptions): void {
  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return;

      if (event.key === APPROVE_KEY) {
        onApprove();
      } else if (event.key === REJECT_KEY) {
        onReject();
      } else if (NEXT_KEYS.has(event.key)) {
        onNext();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onApprove, onReject, onNext, disabled]);
}
