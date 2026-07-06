import type { AdminReviewDetailDto } from "@cuadra/api-client";
import { useState } from "react";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { resolveReviewMatch } from "../api";
import { useKeyboardReview } from "../hooks/useKeyboardReview";
import { ADMIN_DECIDED_BY } from "../lib/decided-by";
import { CompareDiff } from "./CompareDiff";
import { ReasonCodeSelect } from "./ReasonCodeSelect";

// Pantalla de detalle (features #1-#4, P0): store_product crudo vs cada candidato lado a lado
// (SIEMPRE con diff resaltado), aprobar eligiendo un candidato o rechazar con motivo obligatorio.
// Tras resolver, vuelve a la lista. Atajos de teclado (batch 2e, 2.21/2.22): a=aprobar el candidato
// TOP (primero de `candidates`, que ya llega ordenado por score desc — ver
// `product_match_repository.py::list_candidates`), r=enfocar el selector de motivo de rechazo,
// n/→=siguiente (sin contexto de posición-en-cola todavía → vuelve a la lista, misma navegación que
// ya usa el flujo de click; simplificación anotada en el batch).
export function ReviewDetailScreen() {
  const { detail } = useData<{ detail: AdminReviewDetailDto }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeProduct = {
    name: detail.store_product_name ?? null,
    brand: detail.store_product_brand ?? null,
    sizeText: detail.store_product_size_text ?? null,
  };
  const candidates = detail.candidates ?? [];
  const topCandidate = candidates[0];

  const handleApprove = async (canonicalProductId: string) => {
    setBusy(true);
    setError(null);
    const res = await resolveReviewMatch({
      matchId: detail.match_id,
      canonicalProductId,
      decidedBy: ADMIN_DECIDED_BY,
    });
    setBusy(false);
    if (res.error) {
      setError("No se pudo aprobar el match.");
      return;
    }
    void navigate("/admin/review-queue");
  };

  const handleReject = async ({
    reasonCode,
    reasonNote,
  }: {
    reasonCode: string;
    reasonNote: string;
  }) => {
    setBusy(true);
    setError(null);
    const res = await resolveReviewMatch({
      matchId: detail.match_id,
      canonicalProductId: null,
      decidedBy: ADMIN_DECIDED_BY,
      reasonCode,
      reasonNote: reasonNote || undefined,
    });
    setBusy(false);
    if (res.error) {
      setError("No se pudo rechazar el match.");
      return;
    }
    void navigate("/admin/review-queue");
  };

  useKeyboardReview({
    onApprove: () => {
      if (topCandidate) void handleApprove(topCandidate.canonical_product_id);
    },
    onReject: () => {
      document.getElementById("reason-code-select")?.focus();
    },
    onNext: () => {
      void navigate("/admin/review-queue");
    },
    disabled: busy,
  });

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold">Revisar match</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {storeProduct.name ?? "(sin nombre)"} · confianza {Math.round(detail.confidence * 100)}% ·{" "}
        {detail.method}
      </p>
      <p className="mb-4 text-xs text-muted-foreground" data-testid="keyboard-hint">
        Atajos: <kbd>a</kbd> aprobar candidato top · <kbd>r</kbd> enfocar motivo de rechazo ·{" "}
        <kbd>n</kbd> siguiente
      </p>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      {candidates.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground" data-testid="no-candidates">
          Sin candidatos — no hay coincidencias sugeridas para comparar.
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-4">
          {candidates.map((c) => (
            <div key={c.canonical_product_id} className="rounded-md border border-border p-3">
              <CompareDiff
                storeProduct={storeProduct}
                candidate={{ name: c.name ?? null, brand: c.brand ?? null, sizeText: null }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleApprove(c.canonical_product_id)}
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Aprobar este candidato ({Math.round(c.score * 100)}% score)
              </button>
            </div>
          ))}
        </div>
      )}

      <ReasonCodeSelect onReject={(payload) => void handleReject(payload)} />
    </div>
  );
}
