import { apiClient } from "@/lib/api";

const FALLBACK_BASE_URL = "http://localhost:8005";

/**
 * URL del proxy público de imágenes para el sitio Save.
 *
 * El navegador puede cargar esta URL en una etiqueta `<img>` sin CORS, porque la responde nuestro
 * backend. El proxy reenvía la imagen de la tienda aplicando protección SSRF.
 */
export function publicImageProxyUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const base = apiClient.getConfig().baseUrl ?? FALLBACK_BASE_URL;
  const url = new URL("/v1/save/image-proxy", base);
  url.searchParams.set("url", imageUrl);
  return url.toString();
}
