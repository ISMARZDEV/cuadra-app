import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PRODUCT_CANVAS_BG, PRODUCT_CARD_BG } from "@/features/admin/lib/product-surfaces";
import { cn } from "@/lib/utils";

// El par de superficies vive en `product-surfaces` porque lo comparte con la columna Imagen de
// las tablas: si el visor y el thumbnail no usaran los mismos, abrir el modal cambiaría el color
// de fondo de la foto y parecería otra imagen.

interface ImageLightboxProps {
  open: boolean;
  /** Galería en su orden. Vacía = no se abre nada (el disparador ya no debería existir). */
  images: string[];
  title: string;
  onClose: () => void;
}

/**
 * Visor de la galería de un producto, compartido por el catálogo canónico y la Cola de revisión.
 *
 * Existe porque decidir si dos productos son el MISMO se hace mirando la foto, y el thumbnail de
 * 48px de la fila no alcanza: obligaba a entrar al detalle y volver, perdiendo la posición en la
 * lista y la selección en curso.
 *
 * Con UNA sola imagen no se pintan miniaturas ni flechas — serían controles muertos que hay que
 * probar para descubrir que no hacen nada.
 */
export function ImageLightbox({ open, images, title, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(0);
  const many = images.length > 1;

  // Cambiar de producto sin resetear dejaría el visor abierto en la 3ª foto de una galería de una.
  useEffect(() => setIndex(0), [images]);

  const go = useCallback(
    (step: number) => {
      // Circular: toparse con una flecha muerta obliga a razonar dónde se está en vez de mirar.
      setIndex((i) => (images.length ? (i + step + images.length) % images.length : 0));
    },
    [images.length],
  );

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, many, go]);

  if (!open || images.length === 0) return null;

  const current = images[Math.min(index, images.length - 1)];

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup
          data-testid="lightbox-popup"
          style={{ backgroundColor: PRODUCT_CANVAS_BG }}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-[28px] p-4 shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-sm font-semibold text-[#0f172a]">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#64748b] hover:bg-black/5"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {/* TARJETA cuadrada, no una imagen suelta: las fotos de producto ya vienen con su propio
              fondo blanco, así que sobre un modal casi blanco se fundirían con él y la galería se
              vería como una mancha sin límites. El borde es lo que le da contorno; el padding
              evita que el producto toque los bordes y parezca recortado.
              `object-contain`: recortar puede esconder justo el gramaje o la marca. */}
          <div
            data-testid="lightbox-frame"
            style={{ backgroundColor: PRODUCT_CARD_BG }}
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl border border-black/[0.04] p-6 shadow-sm"
          >
            <img
              data-testid="lightbox-main"
              src={current}
              alt={title}
              className="max-h-full max-w-full object-contain"
            />
          </div>

          {many ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="lightbox-prev"
                aria-label="Imagen anterior"
                onClick={() => go(-1)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#94a3b8] hover:bg-black/5 hover:text-[#0f172a]"
              >
                <ChevronLeft className="size-5" />
              </button>

              {/* `flex-1` con tope: con 2-3 fotos las miniaturas LLENAN el ancho (que es como se
                  leen de un vistazo), y con muchas se topan y la tira scrollea en vez de
                  encogerlas hasta volverlas indistinguibles. */}
              <div className="flex flex-1 items-stretch gap-3 overflow-x-auto">
                {images.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    data-testid={`lightbox-thumb-${i}`}
                    aria-label={`Imagen ${i + 1}`}
                    aria-current={i === index}
                    onClick={() => setIndex(i)}
                    style={{ backgroundColor: PRODUCT_CARD_BG }}
                    className={cn(
                      // Mismas tarjetas que la grande, en chico.
                      //
                      // BORDE y no `ring`: el ring se dibuja FUERA de la caja, así que el
                      // `overflow-x-auto` de la tira lo recortaba en las esquinas y el borde se
                      // veía partido. El borde vive dentro del box y nunca se corta.
                      // Siempre 2px (transparente cuando no está seleccionada) para que elegir
                      // otra miniatura no desplace la tira.
                      "flex aspect-square min-w-[4.5rem] flex-1 basis-0 items-center justify-center overflow-hidden rounded-2xl border-2 p-3 shadow-sm transition",
                      i === index
                        ? "border-brand-lime"
                        : "border-black/[0.06] hover:border-black/20",
                    )}
                  >
                    <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                data-testid="lightbox-next"
                aria-label="Imagen siguiente"
                onClick={() => go(1)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#94a3b8] hover:bg-black/5 hover:text-[#0f172a]"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          ) : null}

          {/* Live region SIEMPRE montada con el texto condicional adentro: montarla junto al
              cambio haría que el lector de pantalla no la anuncie. */}
          <p role="status" aria-live="polite" className="text-center text-xs text-[#64748b]">
            {many ? `${index + 1} / ${images.length}` : ""}
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
