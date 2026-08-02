import type {
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
} from "@cuadra/api-client";
import { Check, Store } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { updateCanonicalProduct } from "../api";

interface DescriptionPanelProps {
  canonicalProductId: string;
  description: string | null;
  providers: AdminCanonicalProviderPriceDto[];
  onSaved: (row: AdminCanonicalProductRowDto) => void;
  t: (key: MessageKey) => string;
}

/**
 * Descripción del canónico con las de cada tienda como CANDIDATAS (US-CP-D2).
 *
 * Mismo patrón que la galería de imágenes, y por la misma razón: cada tienda matcheada publica la
 * suya, el operador elige cuál representa mejor al producto y la ajusta si hace falta. Elegir una
 * COPIA el texto al canónico — nunca modifica el de la tienda, que es dato de ella.
 *
 * El texto queda editable después de copiarlo: la descripción de una tienda suele traer su tono
 * comercial ("el prestigioso Arroz…"), y el catálogo no tiene por qué heredarlo.
 */
export function DescriptionPanel({
  canonicalProductId,
  description,
  providers,
  onSaved,
  t,
}: DescriptionPanelProps) {
  const [draft, setDraft] = useState(description ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const titleId = useId();
  const hintId = useId();

  // Si el canónico se recarga desde afuera (editar, archivar), el borrador se re-siembra: dejarlo
  // viejo mostraría un texto que ya no es el del producto.
  useEffect(() => {
    setDraft(description ?? "");
    setSaved(false);
  }, [description]);

  const candidates = providers.filter((p) => Boolean(p.store_product_description?.trim()));
  const dirty = draft.trim() !== (description ?? "").trim();

  const save = async () => {
    setSaving(true);
    setSaved(false);
    // `finally`: si la promesa RECHAZA, un `setSaving(false)` suelto no corre y el botón queda
    // deshabilitado para siempre.
    let updated: Awaited<ReturnType<typeof updateCanonicalProduct>> | null = null;
    try {
      updated = await updateCanonicalProduct(canonicalProductId, {
        description: draft.trim() || null,
      } as never);
    } finally {
      setSaving(false);
    }
    if (updated) {
      onSaved(updated);
      setSaved(true);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={titleId} className="text-sm font-semibold">
            {t("admin.canonicalDetail.description.current")}
          </h3>
          {dirty ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {t("admin.canonicalDetail.description.unsaved")}
            </span>
          ) : null}
        </div>
        <p id={hintId} className="text-xs text-muted-foreground">
          {t("admin.canonicalDetail.description.hint")}
        </p>

        {/* El `<h3>` ya nombra este campo en pantalla; enlazarlo evita repetir la etiqueta y deja
            de anunciarlo como "campo de texto, en blanco". */}
        <textarea
          aria-labelledby={titleId}
          aria-describedby={hintId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          rows={4}
          placeholder={t("admin.canonicalDetail.description.placeholder")}
          className="w-full rounded-xl border border-border bg-background p-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-brand-lime focus-visible:outline-none"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="inline-flex h-8 items-center rounded-full bg-brand-forest px-3 text-xs font-semibold text-brand-lime disabled:opacity-50"
          >
            {saving
              ? t("admin.canonicalDetail.description.saving")
              : t("admin.canonicalDetail.description.save")}
          </button>
          {/* La región vive SIEMPRE en el DOM, aunque esté vacía: un lector de pantalla sólo
              anuncia cambios dentro de una live region que ya existía cuando cambió. */}
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-emerald-600 dark:text-emerald-400"
          >
            {saved ? t("admin.canonicalDetail.description.saved") : ""}
          </span>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Store className="size-4 text-brand-forest dark:text-brand-lime" aria-hidden="true" />
          {t("admin.canonicalDetail.description.candidates")}
        </h3>

        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("admin.canonicalDetail.description.empty")}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {candidates.map((p) => {
                const text = (p.store_product_description ?? "").trim();
                const inUse = text === draft.trim();
                return (
                  <li
                    key={p.store_product_id}
                    className={cn(
                      "rounded-xl border p-3",
                      inUse ? "border-brand-lime bg-brand-lime/10" : "border-border",
                    )}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <ProviderLogo
                        name={p.provider_name}
                        logoUrl={p.provider_logo_url}
                        className="max-h-6 max-w-12 object-contain"
                      />
                      <button
                        type="button"
                        disabled={inUse}
                        // Sólo copia al borrador: guardar sigue siendo un acto explícito, para
                        // que el operador pueda ajustar el texto antes de publicarlo.
                        onClick={() => {
                          setDraft(text);
                          setSaved(false);
                        }}
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold",
                          inUse
                            ? "bg-brand-lime/30 text-brand-forest"
                            : "bg-brand-lime text-brand-forest hover:bg-brand-lime/90",
                        )}
                      >
                        {inUse ? <Check className="size-3" /> : null}
                        {t(
                          inUse
                            ? "admin.canonicalDetail.description.inUse"
                            : "admin.canonicalDetail.description.use",
                        )}
                      </button>
                    </div>
                    <p className="text-sm leading-snug text-muted-foreground">{text}</p>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("admin.canonicalDetail.description.copyHint")}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
