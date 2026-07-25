import type {
  AdminCanonicalProviderPriceDto,
  CanonicalImageDto,
} from "@cuadra/api-client";
import { ArrowLeft, ArrowRight, ImageOff, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui-base/button";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import {
  addCanonicalImage,
  removeCanonicalImage,
  reorderCanonicalImages,
} from "../api";

interface ImageGalleryPanelProps {
  canonicalProductId: string;
  images: CanonicalImageDto[];
  providers: AdminCanonicalProviderPriceDto[];
  onChanged: (images: CanonicalImageDto[]) => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

/**
 * Galería ORDENADA del canónico (US-CP-D3/D4b). La posición 1 es la que ve el público, y por eso
 * el orden no es cosmético: reordenar cambia la imagen del sitio.
 *
 * El orden se mueve con flechas y no con drag & drop a propósito: son 2-4 imágenes, el drag es
 * inoperable con teclado y en una tabla admin la precisión importa más que la fluidez.
 */
export function ImageGalleryPanel({
  canonicalProductId,
  images,
  providers,
  onChanged,
  t,
  locale,
}: ImageGalleryPanelProps) {
  const [busy, setBusy] = useState(false);
  const [uploadNotice, setUploadNotice] = useState(false);

  const usedUrls = new Set(images.map((i) => i.url));
  const candidates = providers.filter((p) => Boolean(p.store_product_image_url));

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const ids = images.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    const updated = await reorderCanonicalImages(canonicalProductId, ids);
    setBusy(false);
    if (updated) onChanged(updated);
  };

  const remove = async (imageId: string) => {
    setBusy(true);
    const updated = await removeCanonicalImage(canonicalProductId, imageId);
    setBusy(false);
    if (updated) onChanged(updated);
  };

  const add = async (url: string, storeProductId: string) => {
    setBusy(true);
    const created = await addCanonicalImage(canonicalProductId, url, storeProductId);
    setBusy(false);
    if (created) onChanged([...images, created]);
  };

  return (
    <div className="space-y-6">
      {/* ── Galería ordenada ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("admin.canonicalDetail.image.gallery")}</h3>

        {images.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("admin.canonicalDetail.image.emptyGallery")}
          </p>
        ) : (
          <ol className="flex flex-wrap gap-4">
            {images.map((image, index) => (
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
                  <img
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
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowLeft className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={t("admin.canonicalDetail.image.moveDown")}
                    disabled={busy || index === images.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowRight className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={t("admin.canonicalDetail.image.remove")}
                    disabled={busy}
                    destructive
                    onClick={() => void remove(image.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}
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
              {candidates.map((p) => {
                const url = p.store_product_image_url as string;
                const already = usedUrls.has(url);
                return (
                  <li key={p.store_product_id} className="w-28 space-y-1.5">
                    <img
                      src={url}
                      alt={p.provider_name}
                      className={cn(
                        "size-28 w-full rounded-xl border bg-white object-contain",
                        already ? "border-brand-lime opacity-60" : "border-border",
                      )}
                    />
                    <p className="truncate text-xs text-muted-foreground">{p.provider_name}</p>
                    <button
                      type="button"
                      disabled={already || busy}
                      onClick={() => void add(url, p.store_product_id)}
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
