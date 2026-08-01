import type {
  AdminCanonicalProviderPriceDto,
  CanonicalImageDto,
} from "@cuadra/api-client";
import { ArrowLeft, ArrowRight, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui-base/button";
import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";
import { ProxiedImage } from "@/features/admin/components/ProxiedImage";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import {
  addCanonicalImage,
  listCanonicalImages,
  removeCanonicalImage,
  reorderCanonicalImages,
} from "../api";

/** Acción sobre la posición 1 esperando confirmación. Se guarda la INTENCIÓN, no el resultado:
 * así cancelar no deja nada a medias. */
type PendingAction =
  | { kind: "remove"; imageId: string }
  | { kind: "move"; index: number; delta: number };

interface ImageGalleryPanelProps {
  canonicalProductId: string;
  images: CanonicalImageDto[];
  providers: AdminCanonicalProviderPriceDto[];
  onChanged: (images: CanonicalImageDto[]) => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

const DRAFT_PREFIX = "draft-";

function isDraftId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}

function nextDraftId(): string {
  return `${DRAFT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Galería ORDENADA del canónico (US-CP-D3/D4b). La posición 1 es la que ve el público, y por eso
 * el orden no es cosmético: reordenar cambia la imagen del sitio.
 *
 * El orden se mueve con flechas y no con drag & drop a propósito: son 2-4 imágenes, el drag es
 * inoperable con teclado y en una tabla admin la precisión importa más que la fluidez.
 *
 * EDITAR la galería ahora usa un borrador: agregar/quitar/reordenar solo mutan el estado local
 * hasta que el operador guarda. Esto permite deshacer una secuencia de cambios y evita que un
 * error de red deje el catálogo en un estado intermedio invisible.
 */
export function ImageGalleryPanel({
  canonicalProductId,
  images,
  providers,
  onChanged,
  t,
  locale,
}: ImageGalleryPanelProps) {
  const [draftImages, setDraftImages] = useState<CanonicalImageDto[]>(images);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState(false);
  // Acción que toca la posición 1 y espera confirmación. `null` = no hay nada pendiente.
  const [pending, setPending] = useState<PendingAction | null>(null);
  const titleId = useId();

  // Si el canónico se recarga desde afuera (navegación, archivar), el borrador se re-siembra.
  useEffect(() => {
    setDraftImages(images);
    setSaved(false);
    setSaveError(null);
  }, [images]);

  const usedUrls = new Set(draftImages.map((i) => i.url));
  // Una entrada por IMAGEN, no por tienda: Sirena publica la bolsa y la etiqueta nutricional, y
  // ofrecer sólo la primera dejaría la segunda inalcanzable desde el admin.
  const candidates = providers.flatMap((p) => {
    const urls = p.store_product_image_urls?.length
      ? p.store_product_image_urls
      : p.store_product_image_url
        ? [p.store_product_image_url]
        : [];
    return urls.map((url, index) => ({
      key: `${p.store_product_id}-${index}`,
      url,
      providerName: p.provider_name,
      storeProductId: p.store_product_id,
      // Numerar sólo cuando la tienda publica más de una: "Sirena 1/1" sería ruido.
      badge: urls.length > 1 ? `${index + 1}/${urls.length}` : null,
    }));
  });

  const dirty =
    draftImages.length !== images.length ||
    draftImages.some((d, i) => d.id !== images[i]?.id || d.url !== images[i]?.url);

  const moveDraft = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draftImages.length) return;
    setDraftImages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaved(false);
  };

  const removeDraft = (imageId: string) => {
    setDraftImages((prev) => prev.filter((img) => img.id !== imageId));
    setSaved(false);
  };

  const addDraft = (url: string, storeProductId: string) => {
    setDraftImages((prev) => [
      ...prev,
      {
        id: nextDraftId(),
        url,
        position: prev.length + 1,
        source_store_product_id: storeProductId,
        is_primary: false,
      },
    ]);
    setSaved(false);
  };

  const cancel = () => {
    setDraftImages(images);
    setSaveError(null);
    setSaved(false);
  };

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    setSaved(false);
    setSaveError(null);
    try {
      const originalIds = new Set(images.map((i) => i.id));
      const removed = images.filter((o) => !draftImages.some((d) => d.id === o.id));
      const added = draftImages.filter((d) => !originalIds.has(d.id));

      // 1. Eliminar imágenes que ya no están en el borrador.
      await Promise.all(removed.map((img) => removeCanonicalImage(canonicalProductId, img.id)));

      // 2. Agregar nuevas imágenes y recolectar sus ids reales.
      const addedResults = await Promise.all(
        added.map((img) =>
          addCanonicalImage(canonicalProductId, img.url, img.source_store_product_id ?? undefined),
        ),
      );

    // 3. Mapear ids temporarios a reales y construir el orden final deseado.
    const idMap = new Map<string, string>();
    added.forEach((draft, i) => {
      const created = addedResults[i];
      if (created) idMap.set(draft.id, created.id);
    });
    const finalIds = draftImages.map((img) => idMap.get(img.id) ?? img.id);

    // 4. Reordenar solo si el orden cambió (incluyendo las agregadas). El servidor
    //    coloca las imágenes agregadas al final; si el operador las subió de posición,
    //    hay que reflejarlo.
    const keptOrder = images
      .filter((o) => !removed.some((r) => r.id === o.id))
      .map((o) => o.id);
    const addedServerOrder = addedResults.filter((img): img is CanonicalImageDto => Boolean(img)).map((img) => img.id);
    const serverOrderAfterAddRemove = [...keptOrder, ...addedServerOrder];
    const needsReorder =
      finalIds.length > 0 && JSON.stringify(serverOrderAfterAddRemove) !== JSON.stringify(finalIds);

    if (needsReorder) {
      const updated = await reorderCanonicalImages(canonicalProductId, finalIds);
      if (updated) {
        onChanged(updated);
      } else {
        // Fallback: pedir la lista fresca al servidor si reorder no devolvió nada.
        const fresh = await listCanonicalImages(canonicalProductId);
        if (fresh) onChanged(fresh);
      }
    } else {
      // Sin reordenamiento, pedir la lista fresca para reflejar ids reales y posiciones.
      const fresh = await listCanonicalImages(canonicalProductId);
      if (fresh) onChanged(fresh);
    }

      setSaved(true);
    } catch (err) {
      // Mostrar siempre el mensaje localizado amigable; el error técnico queda para la consola.
      console.error("[ImageGalleryPanel] save failed", err);
      setSaveError(t("admin.canonicalDetail.image.saveError"));
    } finally {
      setBusy(false);
    }
  };

  // ── Fricción proporcional al riesgo ──────────────────────────────────────────
  // Regenerar un slug advierte; mover la imagen que ve un consumidor real no advertía nada. Estas
  // dos guardas igualan la fricción al impacto: sólo pregunta cuando la acción toca la posición 1.

  const requestMove = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draftImages.length) return;
    // Tanto sacar la 1ª de su puesto como promover otra a él cambian lo que se publica.
    if (index === 0 || target === 0) {
      setPending({ kind: "move", index, delta });
      return;
    }
    moveDraft(index, delta);
  };

  const requestRemove = (image: CanonicalImageDto) => {
    if (image.position === 1) {
      setPending({ kind: "remove", imageId: image.id });
      return;
    }
    removeDraft(image.id);
  };

  const runPending = () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    if (action.kind === "remove") removeDraft(action.imageId);
    else moveDraft(action.index, action.delta);
  };

  const recalculatePositions = (list: CanonicalImageDto[]): CanonicalImageDto[] =>
    list.map((img, i) => ({ ...img, position: i + 1 }));

  const displayImages = recalculatePositions(draftImages);

  return (
    <div className="space-y-6">
      {/* ── Galería ordenada ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={titleId} className="text-sm font-semibold">
            {t("admin.canonicalDetail.image.gallery")}
          </h3>
          {dirty ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {t("admin.canonicalDetail.image.unsaved")}
            </span>
          ) : null}
          {saved && !dirty ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {t("admin.canonicalDetail.image.saved")}
            </span>
          ) : null}
        </div>

        {displayImages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("admin.canonicalDetail.image.emptyGallery")}
          </p>
        ) : (
          <ol className="flex flex-wrap gap-4">
            {displayImages.map((image, index) => (
              <li
                key={image.id}
                className={cn(
                  "w-40 space-y-2 rounded-2xl border-2 p-2.5",
                  image.position === 1
                    ? "border-brand-lime bg-brand-lime/10"
                    : "border-border",
                )}
              >
                <div className="relative">
                  <ProxiedImage
                    src={image.url}
                    alt=""
                    className="size-32 w-full rounded-xl bg-white object-contain"
                  />
                  <span className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-brand-forest text-xs font-bold text-brand-lime">
                    {image.position}
                  </span>
                </div>

                <p className="text-xs font-semibold">
                  {format(locale, "admin.canonicalDetail.image.position", {
                    n: String(image.position),
                  })}
                </p>
                {/* Decir QUÉ significa la posición 1 evita que el operador reordene sin saber
                    que está cambiando lo que se publica. */}
                {image.position === 1 ? (
                  <p className="text-[11px] leading-tight text-brand-forest dark:text-brand-lime">
                    {t("admin.canonicalDetail.image.primary")}
                  </p>
                ) : null}
                <p className="truncate text-[11px] text-muted-foreground">
                  {image.source_store_product_id
                    ? providerNameFor(providers, image.source_store_product_id, locale, t)
                    : t("admin.canonicalDetail.image.manual")}
                </p>

                <div className="flex items-center gap-1">
                  <IconButton
                    label={t("admin.canonicalDetail.image.moveUp")}
                    disabled={busy || index === 0}
                    onClick={() => requestMove(index, -1)}
                  >
                    <ArrowLeft className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={t("admin.canonicalDetail.image.moveDown")}
                    disabled={busy || index === displayImages.length - 1}
                    onClick={() => requestMove(index, 1)}
                  >
                    <ArrowRight className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={t("admin.canonicalDetail.image.remove")}
                    disabled={busy}
                    destructive
                    onClick={() => requestRemove(image)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Acciones del borrador */}
        {dirty || saveError ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="inline-flex h-8 items-center rounded-full bg-brand-forest px-3 text-xs font-semibold text-brand-lime disabled:opacity-50"
            >
              {busy ? t("admin.canonicalDetail.image.saving") : t("admin.canonicalDetail.image.save")}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              {t("admin.canonicalDetail.image.cancel")}
            </button>
            {saveError ? (
              <p className="text-xs text-destructive">{saveError}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Candidatas por tienda ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {t("admin.canonicalDetail.image.candidates")}
          </h3>
          {/* D4 diferido: el botón EXISTE y al tocarlo explica por qué todavía no hace nada.
              Esconderlo dejaría al operador buscando una función que sí vamos a tener. */}
          <button
            type="button"
            onClick={() => setUploadNotice(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            <Upload className="size-3.5" />
            {t("admin.canonicalDetail.image.upload")}
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("admin.canonicalDetail.image.empty")}
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-3">
              {candidates.map((c) => {
                const already = usedUrls.has(c.url);
                return (
                  <li key={c.key} className="w-28 space-y-1.5">
                    <div className="relative">
                      <ProxiedImage
                        src={c.url}
                        alt={c.providerName}
                        className={cn(
                          "size-28 w-full rounded-xl border bg-white object-contain",
                          already ? "border-brand-lime opacity-60" : "border-border",
                        )}
                      />
                      {c.badge ? (
                        <span className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {c.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.providerName}</p>
                    <button
                      type="button"
                      disabled={already || busy}
                      onClick={() => addDraft(c.url, c.storeProductId)}
                      className={cn(
                        "inline-flex h-7 w-full items-center justify-center gap-1 rounded-full text-xs font-semibold",
                        already
                          ? "bg-muted text-muted-foreground"
                          : "bg-brand-lime text-brand-forest hover:bg-brand-lime/90",
                        busy && "opacity-50",
                      )}
                    >
                      {already ? null : <Plus className="size-3" />}
                      {t(
                        already
                          ? "admin.canonicalDetail.image.added"
                          : "admin.canonicalDetail.image.add",
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("admin.canonicalDetail.image.candidatesHint")}
            </p>
          </>
        )}
      </section>

      {/* Confirmación fuerte SÓLO cuando la acción toca la posición 1. Reusa el mismo
          `ConfirmDialog` que archivar y regenerar slug: la fricción de una acción debe ser
          proporcional a su impacto, y esta publica un cambio para el consumidor. */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t("admin.canonicalDetail.image.confirmTitle")}
        description={t(
          pending?.kind === "remove"
            ? "admin.canonicalDetail.image.confirmRemove"
            : "admin.canonicalDetail.image.confirmReorder",
        )}
        confirmLabel={t(
          pending?.kind === "remove"
            ? "admin.canonicalDetail.image.confirmRemoveAccept"
            : "admin.canonicalDetail.image.confirmReorderAccept",
        )}
        cancelLabel={t("admin.canonicalDetail.image.confirmCancel")}
        destructive={pending?.kind === "remove"}
        busy={busy}
        onConfirm={runPending}
      />

      {/* Aviso INFORMATIVO, no una confirmación: un `ConfirmDialog` ofrecería "Cancelar" y
          "Entendido" haciendo exactamente lo mismo, y dos botones idénticos mienten sobre la
          interacción — acá no hay ninguna decisión que tomar. */}
      <Dialog.Root open={uploadNotice} onOpenChange={setUploadNotice}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-card p-6 text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
              {t("admin.canonicalDetail.image.uploadSoonTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {t("admin.canonicalDetail.image.uploadSoon")}
            </Dialog.Description>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setUploadNotice(false)} className="rounded-full">
                {t("admin.canonicalDetail.image.understood")}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** Nombre de la tienda de la que salió una imagen; si el enlace ya no existe, se dice "manual"
 * en vez de mostrar un id crudo. */
function providerNameFor(
  providers: AdminCanonicalProviderPriceDto[],
  storeProductId: string,
  locale: Locale,
  t: (key: MessageKey) => string,
): string {
  const provider = providers.find((p) => p.store_product_id === storeProductId);
  return provider
    ? format(locale, "admin.canonicalDetail.image.fromStore", { name: provider.provider_name })
    : t("admin.canonicalDetail.image.manual");
}

function IconButton({
  label,
  disabled,
  destructive,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-40",
        destructive
          ? "border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400"
          : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
