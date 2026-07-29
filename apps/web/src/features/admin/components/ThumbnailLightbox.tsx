import { useRef, useState } from "react";

import { ImageLightbox } from "./ImageLightbox";
import { ThumbnailWithCount } from "./ThumbnailWithCount";

interface ThumbnailLightboxProps {
  src: string | null | undefined;
  alt: string;
  /** Título del visor — el nombre del producto. */
  title: string;
  count: number | null;
  emptyLabel: string;
  countTestId?: string;
  /**
   * Trae la galería completa. Se llama UNA vez, al primer abrir.
   *
   * No viene en la respuesta del listado a propósito: una página de 100 filas cargaría cientos de
   * URLs que casi nunca se miran. Se pide cuando el operador demuestra interés.
   */
  loadImages?: () => Promise<string[]>;
  /** Tamaño y radio del cuadrado. Default 48px — el de las tablas. */
  className?: string;
}

/**
 * El thumbnail de una fila, clickeable para abrir la galería en grande.
 *
 * Sin imagen NO es un botón: un disparador que abre un modal vacío enseña a desconfiar del control.
 */
export function ThumbnailLightbox({
  src,
  alt,
  title,
  count,
  emptyLabel,
  countTestId,
  loadImages,
  className,
}: ThumbnailLightboxProps) {
  const [open, setOpen] = useState(false);
  // Arranca con la imagen que la fila YA tiene: abrir en blanco esperando la red se siente roto,
  // y esa foto es justamente la primera de la galería.
  const [images, setImages] = useState<string[]>(src ? [src] : []);
  const loaded = useRef(false);

  const thumbnail = (
    <ThumbnailWithCount
      src={src}
      alt={alt}
      count={count}
      emptyLabel={emptyLabel}
      countTestId={countTestId}
      className={className}
    />
  );

  if (!src) return thumbnail;

  const openLightbox = () => {
    setOpen(true);
    if (loaded.current || !loadImages) return;
    loaded.current = true;
    void loadImages()
      .then((urls) => {
        if (urls.length > 0) setImages(urls);
      })
      // Un fallo de red NO puede dejar al operador sin ver la foto que la fila ya mostraba.
      .catch(() => {});
  };

  return (
    <>
      <button
        type="button"
        onClick={openLightbox}
        aria-label={title}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2"
      >
        {thumbnail}
      </button>
      <ImageLightbox
        open={open}
        images={images}
        title={title}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
