import type { BasketPreviewGroupDto, BasketQueryDto } from "@cuadra/api-client";
import { ArrowUpRight, ImageOff, Pencil, Plus, Search, Tag, Type } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FilterModal } from "@/features/admin/components/filters/FilterModal";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { formatMoney } from "@/features/save/lib/format";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { createBasketQueryEntry, previewBasketQueryTerm, updateBasketQueryEntry } from "../api";
import { DEFAULT_BASKET_MARKET } from "../types";

type T = (key: MessageKey) => string;

type ModalState = { mode: "add" } | { mode: "edit"; entry: BasketQueryDto };

// Modal de alta/edición de una query de la canasta — compone el MISMO `FilterModal` que el modal de
// filtros de la Cola de Revisión (header ícono en círculo lima + título verde, body con `FilterField`,
// footer Limpiar/Aplicar). "Aplicar" crea (add) o guarda (edit); el diseño es idéntico entre ambos.
export function BasketQueryModal({
  state,
  onClose,
  refresh,
  locale,
}: {
  state: ModalState;
  onClose: () => void;
  refresh: () => Promise<void>;
  locale: Locale;
}) {
  const { t } = useAdminI18n(locale);
  const initialQuery = state.mode === "edit" ? state.entry.query_text : "";
  const initialCategory = state.mode === "edit" ? (state.entry.category_label ?? "") : "";
  const [queryText, setQueryText] = useState(initialQuery);
  const [categoryLabel, setCategoryLabel] = useState(initialCategory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BasketPreviewGroupDto[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const isEdit = state.mode === "edit";

  const runPreview = async () => {
    if (!queryText.trim()) {
      setError(t("admin.basket.modal.errPreview"));
      return;
    }
    setPreviewing(true);
    setError(null);
    setPreview(await previewBasketQueryTerm(queryText.trim(), DEFAULT_BASKET_MARKET));
    setPreviewing(false);
  };

  const apply = async () => {
    if (!queryText.trim()) {
      setError(t("admin.basket.modal.errRequired"));
      return;
    }
    setBusy(true);
    setError(null);

    if (state.mode === "add") {
      const res = await createBasketQueryEntry({
        marketId: DEFAULT_BASKET_MARKET,
        queryText,
        categoryLabel: categoryLabel.trim() || null,
      });
      setBusy(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
    } else {
      const res = await updateBasketQueryEntry(state.entry.id, {
        queryText,
        categoryLabel: categoryLabel.trim() || null,
      });
      setBusy(false);
      if (res.error) {
        setError(t("admin.basket.modal.errSave"));
        return;
      }
    }
    await refresh();
    onClose();
  };

  return (
    <FilterModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={isEdit ? t("admin.basket.modal.titleEdit") : t("admin.basket.modal.titleAdd")}
      icon={isEdit ? <Pencil /> : <Plus />}
      onClear={() => {
        setQueryText(initialQuery);
        setCategoryLabel(initialCategory);
        setError(null);
      }}
      onApply={() => void apply()}
      clearLabel={t("admin.basket.modal.clear")}
      applyLabel={
        busy
          ? t("admin.basket.modal.saving")
          : isEdit
            ? t("admin.basket.modal.applyEdit")
            : t("admin.basket.modal.applyAdd")
      }
      applyIcon={isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <FilterField icon={<Type />} label={t("admin.basket.modal.fieldQuery")} htmlFor="basket-query-text">
        <Input
          id="basket-query-text"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder={t("admin.basket.modal.phQuery")}
          className="h-11! rounded-xl"
        />
      </FilterField>

      <FilterField icon={<Tag />} label={t("admin.basket.modal.fieldCategory")} htmlFor="basket-query-category">
        <Input
          id="basket-query-category"
          value={categoryLabel}
          onChange={(e) => setCategoryLabel(e.target.value)}
          placeholder={t("admin.basket.modal.phCategory")}
          className="h-11! rounded-xl"
        />
      </FilterField>

      {/* Preview dry-run (F2 §3.3): qué devolvería este término en cada tienda del mercado, ANTES de
          comprometerlo — para ver el impacto/ruido de la query antes de agregarla. */}
      <div className="space-y-3">
        <button
          type="button"
          disabled={previewing || !queryText.trim()}
          onClick={() => void runPreview()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:border-brand-forest hover:text-brand-forest disabled:opacity-50 dark:hover:border-brand-lime dark:hover:text-brand-lime"
        >
          <Search className="size-4" aria-hidden="true" />
          {previewing ? t("admin.basket.modal.previewLoading") : t("admin.basket.modal.previewBtn")}
        </button>

        {preview ? (
          preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.basket.modal.previewNone")}</p>
          ) : (
            <div className="space-y-3">
              {preview.map((group) => (
                <PreviewGroup key={group.provider_id} group={group} t={t} />
              ))}
            </div>
          )
        ) : null}
      </div>
    </FilterModal>
  );
}

// Resultado del preview para UNA tienda: nombre + nº de resultados, y hasta 5 muestras (imagen,
// nombre, precio, link "↗"). Si esa fuente falló (config/upstream), muestra el error en vez de filas.
function PreviewGroup({ group, t }: { group: BasketPreviewGroupDto; t: T }) {
  const entries = group.entries ?? [];
  return (
    <div className="rounded-2xl border border-black/5 bg-muted/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{group.provider_name}</span>
        {group.error ? (
          <span className="text-xs text-destructive">{t("admin.basket.modal.previewError")}</span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {entries.length}{" "}
            {entries.length === 1 ? t("admin.basket.modal.resultSing") : t("admin.basket.modal.resultPlur")}
          </span>
        )}
      </div>

      {group.error ? (
        <p className="text-xs text-muted-foreground">{group.error}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("admin.basket.modal.noResults")}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.slice(0, 5).map((e) => (
            <li key={e.external_id} className="flex items-center gap-2.5">
              {e.image_url ? (
                <img src={e.image_url} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <ImageOff className="size-4" aria-hidden="true" />
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{e.name}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatMoney(e.price_minor, e.currency)}
              </span>
              {e.url ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t("admin.basket.modal.viewAria")} ${e.name} · ${group.provider_name}`}
                  className="shrink-0 text-muted-foreground hover:text-brand-forest dark:hover:text-brand-lime"
                >
                  <ArrowUpRight className="size-4" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
