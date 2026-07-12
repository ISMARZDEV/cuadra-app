import type { AdminReviewDetailDto } from "@cuadra/api-client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { createCanonicalAndLinkMatch, resolveReviewMatch } from "../api";
import { useKeyboardReview } from "../hooks/useKeyboardReview";
import { ADMIN_DECIDED_BY } from "../lib/decided-by";
import { CandidatesSection } from "./detail/CandidatesSection";
import { CreateCanonicalPanel, type CreateCanonicalPayload } from "./detail/CreateCanonicalPanel";
import { DetailHeader } from "./detail/DetailHeader";
import { RejectPanel } from "./detail/RejectPanel";
import { StoreProductPanel } from "./detail/StoreProductPanel";

// Nota de auditoría al pie (módulo-scope, estático).
function AuditFooter() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-black/5 bg-muted/40 px-4 py-3 text-xs text-muted-foreground dark:border-white/10">
      <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      Todas las decisiones se guardan en forma segura y auditable. Solo tú podrás aprobar o rechazar
      este match.
    </div>
  );
}

// Pantalla de detalle "Revisar match" (rediseño): store_product vs candidatos lado a lado, aprobar
// eligiendo un candidato o rechazar con motivo obligatorio. Es SOLO composición + wiring — cada pieza
// (header, panel, candidatos, rechazo) vive en `detail/` y está testeada aparte. Conserva el flujo
// validado: `resolveReviewMatch` (misma-transacción en el backend), atajos a/r/n, navegación a la
// lista post-resolve. Doctrina SACRED intacta (solo READ + UI).
export function ReviewDetailScreen() {
  const { detail, prevMatchId, nextMatchId, queuePosition, queueTotal } = useData<{
    detail: AdminReviewDetailDto;
    prevMatchId: string | null;
    nextMatchId: string | null;
    queuePosition: number | null;
    queueTotal: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const store = {
    name: detail.store_product_name ?? null,
    brand: detail.store_product_brand ?? null,
    sizeText: detail.store_product_size_text ?? null,
  };
  const candidates = detail.candidates ?? [];
  const topCandidate = candidates[0];

  // Navegación entre matches (atajos p/n, botones del pager). `goNext`/`goPrev` van al SIGUIENTE /
  // ANTERIOR pendiente (resueltos en el SSR, `+data.ts`); si no hay siguiente, cae a la lista.
  const goNext = () => {
    void navigate(nextMatchId ? `/admin/review-queue/${nextMatchId}` : "/admin/review-queue");
  };
  const goPrev = () => {
    if (prevMatchId) void navigate(`/admin/review-queue/${prevMatchId}`);
  };

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
    // Tras resolver, PASA AL SIGUIENTE match pendiente (no vuelve a la lista) — flujo de revisión
    // en cadena: el revisor sigue con el próximo sin volver atrás.
    goNext();
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
    goNext();
  };

  const handleCreateCanonical = async (payload: CreateCanonicalPayload) => {
    setBusy(true);
    setError(null);
    const res = await createCanonicalAndLinkMatch({
      matchId: detail.match_id,
      decidedBy: ADMIN_DECIDED_BY,
      name: payload.name,
      brand: payload.brand,
      quantityAmount: payload.quantityAmount,
      quantityMeasure: payload.quantityMeasure,
      taxonomyNodeId: payload.taxonomyNodeId,
      marketId: detail.market_id ?? "DO",
    });
    setBusy(false);
    if (res.error) {
      setError("No se pudo crear el canónico.");
      return;
    }
    goNext();
  };

  // Acciones de atajos — compartidas por teclado y botones (misma acción, sea tecla o click).
  const approveTop = () => {
    if (topCandidate) void handleApprove(topCandidate.canonical_product_id);
  };
  const focusReject = () => {
    document.getElementById("reason-code-select")?.focus();
  };

  useKeyboardReview({
    onApprove: approveTop,
    onReject: focusReject,
    onNext: goNext,
    onPrev: goPrev,
    disabled: busy,
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <DetailHeader
        name={store.name}
        confidence={detail.confidence}
        method={detail.method}
        locale="es"
        onApprove={approveTop}
        onReject={focusReject}
        onNext={goNext}
        onPrev={goPrev}
        disabled={busy}
        queue={{
          position: queuePosition,
          total: queueTotal,
          hasPrev: prevMatchId !== null,
          hasNext: nextMatchId !== null,
        }}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-stretch">
        <StoreProductPanel
          name={store.name}
          brand={store.brand}
          sizeText={store.sizeText}
          imageUrl={detail.store_product_image_url ?? null}
          sku={detail.store_product_sku ?? null}
          ean={detail.store_product_ean ?? null}
          providerName={detail.provider_name ?? null}
          confidence={detail.confidence}
          method={detail.method}
          candidateCount={candidates.length}
          locale="es"
        />
        <CandidatesSection
          candidates={candidates}
          store={store}
          onApprove={handleApprove}
          disabled={busy}
        />
      </div>

      <CreateCanonicalPanel
        defaultName={store.name}
        defaultBrand={store.brand}
        defaultSizeText={store.sizeText}
        suggestedCategoryId={detail.suggested_taxonomy_node_id ?? null}
        suggestedCategoryName={detail.suggested_category_name ?? null}
        onCreate={handleCreateCanonical}
        disabled={busy}
      />
      <RejectPanel onReject={handleReject} disabled={busy} />
      <AuditFooter />
    </div>
  );
}
