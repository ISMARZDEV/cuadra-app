import type { BulkCategoryAdviceDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui-base/button";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { bulkSetCanonicalCategory, suggestBulkCategories } from "../api";
import { CategoryPicker } from "./CategoryPicker";

interface BulkCategoryModalProps {
  /** Ids seleccionados; vacío = modal cerrado. */
  selected: string[];
  leaves: TaxonomyLeafDto[];
  onClose: () => void;
  onApplied: () => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

/**
 * Asignación de categoría en lote (US-CP-L10). Reusa el MISMO `CategoryPicker` del detalle: el
 * operador no debería aprender dos flujos para la misma decisión.
 *
 * Las sugerencias se calculan sobre el CONJUNTO, no por producto, y el modal advierte si los
 * seleccionados parecen de categorías distintas — asignar una sola a un lote heterogéneo ensucia
 * varios productos de un saque, y deshacerlo cuesta más que evitarlo.
 */
export function BulkCategoryModal({
  selected,
  leaves,
  onClose,
  onApplied,
  t,
  locale,
}: BulkCategoryModalProps) {
  const [advice, setAdvice] = useState<BulkCategoryAdviceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = selected.length > 0;
  const key = selected.join(",");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAdvice(null);
    setResult(null);
    setError(null);
    void (async () => {
      const res = await suggestBulkCategories(selected);
      if (!cancelled) setAdvice(res);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open]);

  if (!open) return null;

  const apply = async (taxonomyNodeId: string) => {
    setBusy(true);
    setError(null);
    const res = await bulkSetCanonicalCategory(selected, taxonomyNodeId);
    setBusy(false);
    if (!res) {
      setError(t("admin.canonicalProducts.bulk.error"));
      return;
    }
    setResult({ ok: res.succeeded_count, failed: res.failed_count });
    onApplied();
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                {t("admin.canonicalProducts.bulk.title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {format(locale, "admin.canonicalProducts.bulk.subtitle", {
                  count: String(selected.length),
                })}
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {result ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-5" />
                  {format(locale, "admin.canonicalProducts.bulk.done", {
                    count: String(result.ok),
                  })}
                </p>
                {result.failed > 0 ? (
                  <p className="text-sm text-destructive">
                    {format(locale, "admin.canonicalProducts.bulk.someFailed", {
                      count: String(result.failed),
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {error ? (
                  <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                {/* La advertencia va ARRIBA del picker: tiene que leerse antes de elegir, no
                    después. */}
                {advice?.heterogeneous ? (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {t("admin.canonicalProducts.bulk.heterogeneous")}
                  </p>
                ) : null}

                {advice && advice.without_signal > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {format(locale, "admin.canonicalProducts.bulk.withoutSignal", {
                      count: String(advice.without_signal),
                    })}
                  </p>
                ) : null}

                <CategoryPicker
                  currentId={null}
                  suggestions={(advice?.suggestions ?? []).map((s) => ({
                    taxonomy_node_id: s.taxonomy_node_id,
                    name: `${s.name} · ${format(locale, "admin.canonicalProducts.bulk.supportedBy", { count: String(s.product_count) })}`,
                    matched_tokens: s.matched_tokens,
                    signal: s.signal,
                  }))}
                  leaves={leaves}
                  onPick={(nodeId) => void apply(nodeId)}
                  busy={busy}
                  t={t}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {t(
                result
                  ? "admin.canonicalProducts.bulk.close"
                  : "admin.canonicalProducts.form.cancel",
              )}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
