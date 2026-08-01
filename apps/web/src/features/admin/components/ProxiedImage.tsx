import { useEffect, useId, useState } from "react";

import { authHeaders } from "@/features/save/hooks/use-auth";

import { apiClient } from "@/lib/api";

const API_BASE_URL =
  typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE_URL
    ? (import.meta.env.VITE_API_BASE_URL as string)
    : "http://localhost:8005";

function proxyUrlFor(imageUrl: string): string {
  const base = apiClient.getConfig().baseUrl ?? API_BASE_URL;
  const url = new URL("/v1/admin/save/image-proxy", base);
  url.searchParams.set("url", imageUrl);
  return url.toString();
}

interface ProxiedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

/**
 * Imagen servida a través del proxy de imágenes del backend.
 *
 * El navegador no puede cargar imágenes de tiendas externas por CORS, y además no puede enviar
 * el header `Authorization` en una etiqueta `<img>` cross-origin. Este componente las trae con
 * `fetch` (autenticado), crea un object URL y lo usa como `src`.
 */
export function ProxiedImage({ src, alt, ...rest }: ProxiedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    setError(false);

    void (async () => {
      try {
        const res = await fetch(proxyUrlFor(src), {
          headers: await authHeaders(),
        });
        if (!res.ok) throw new Error(`proxy ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setObjectUrl(blobUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  if (error) {
    return (
      <div
        aria-label={alt}
        role="img"
        className="flex items-center justify-center bg-muted text-[10px] text-muted-foreground"
        {...rest}
      >
        {alt}
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        aria-label={alt}
        role="img"
        aria-busy="true"
        aria-describedby={id}
        className="animate-pulse bg-muted"
        {...rest}
      >
        <span id={id} className="sr-only">
          Cargando imagen
        </span>
      </div>
    );
  }

  return <img src={objectUrl} alt={alt} {...rest} />;
}
