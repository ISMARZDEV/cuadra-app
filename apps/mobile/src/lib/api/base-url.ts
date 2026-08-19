// Puerto de la API en el registro FIJO del repo (web 3006 · api 8005 · metro 8087 · db 5433).
//
// En desarrollo se usa ÉSTE y no el de la URL configurada, y la diferencia costó una sesión: un
// `.env` con `localhost:3000` mandó las peticiones a un puerto donde no hay nada, y el síntoma —un
// «no pudimos cargar»— era idéntico al de la IP caducada. El puerto de la API es un invariante del
// repo, no una preferencia de cada quien: heredarlo de un archivo que se queda viejo reproduce
// exactamente el problema que esta detección viene a eliminar.
const DEV_API_PORT = "8005";

/** ¿Esta URL apunta a la máquina de quien desarrolla? Localhost o cualquier rango privado
 *  (RFC 1918). Lo que NO entra aquí —un dominio público, un túnel— se respeta tal cual: alguien lo
 *  puso a propósito y pisarlo le rompería el entorno en silencio. */
function isLocalTarget(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  // 172.16.0.0 – 172.31.255.255. El 172.32 en adelante YA NO es privado.
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function parts(url: string): { host: string; port: string | null } | null {
  // Sin `new URL()`: en Hermes existe pero su comportamiento con URLs raras no es el de un
  // navegador, y aquí sólo hacen falta el host y el puerto. Una expresión los saca sin sorpresas.
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:]+)(?::(\d+))?/i);
  return m ? { host: m[1], port: m[2] ?? null } : null;
}

/**
 * La URL base de la API.
 *
 * EL PROBLEMA QUE RESUELVE: `EXPO_PUBLIC_API_URL` se HORNEA en el bundle, y la IP LAN del Mac la
 * cambia el DHCP. Una IP que era buena al arrancar Metro deja de serlo sin que nada avise — y el
 * síntoma en pantalla es un «no pudimos cargar los productos» que parece un fallo del código.
 *
 * LA SOLUCIÓN: en desarrollo el host se DEDUCE de quien está sirviendo el bundle. Esa máquina es,
 * por definición, alcanzable desde el dispositivo: es de donde acaba de llegar el JS. El puerto sí
 * sale de lo configurado, porque entre redes cambia la máquina, no el puerto.
 *
 * Se deduce SÓLO cuando el objetivo configurado es local (localhost o rango privado). Una API
 * remota puesta a propósito —staging, un túnel— se respeta.
 */
export function resolveApiBaseUrl({
  configured,
  metroHost,
  isDev,
}: {
  configured: string | undefined;
  /** Host de quien sirve el bundle, sin puerto. `null` fuera de Metro (build de release). */
  metroHost: string | null;
  isDev: boolean;
}): string | undefined {
  if (!isDev || !metroHost) return configured;

  if (configured) {
    const p = parts(configured);
    // Ilegible o remota → se respeta. No se adivina sobre algo que no se entiende.
    if (!p || !isLocalTarget(p.host)) return configured;
  }

  // Objetivo local (o nada configurado): la máquina que sirve el bundle, en el puerto del registro.
  // Ni el host ni el puerto del `.env` participan — los dos son justo lo que se queda viejo.
  return `http://${metroHost}:${DEV_API_PORT}`;
}
