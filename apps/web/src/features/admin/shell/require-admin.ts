import { getMe } from "@cuadra/api-client";

import { apiClient } from "@/lib/api";

// Gate SERVER-SIDE de `/admin/*` (SAGRADO, cuadra-clerk/cuadra-web): nunca confiar en un check de
// solo-cliente. No reinventa verificación de JWT — delega en `/identity/me`, que YA resuelve rol +
// capabilities efectivas (RS256/JWKS + RBAC, Fase 1 de este cambio). Este módulo solo extrae el
// token del request SSR y pregunta al backend.
//
// Cómo llega el token: Clerk (instancia dev, sin dominio custom) setea la cookie `__session` en el
// dominio de la app tras el login — el MISMO JWT corto que el backend verifica. `pageContext.headers`
// (Vike, https://vike.dev/headers) expone las cabeceras crudas del request; en dev el plugin de Vike
// las puebla solo, en prod `server/index.js` debe pasar `headersOriginal: req.headers` a `renderPage`.
//
// Gotcha conocido (documentado, no oculto): el modo dev-login (sin Clerk) guarda el token en
// localStorage — inalcanzable server-side. Con dev-login puro, `/admin/*` SIEMPRE 403 en SSR; el
// gate real requiere Clerk activo (que es el modo configurado hoy, ver `apps/web/.env`).
const SESSION_COOKIE = "__session";

function extractToken(headers: Record<string, string> | null | undefined): string | null {
  if (!headers) return null;

  const authHeader = headers.authorization;
  if (authHeader) {
    const [, token] = authHeader.split(" ");
    if (token) return token;
  }

  const cookieHeader = headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

export interface AdminIdentity {
  userId: string;
  capabilities: string[];
}

/** Resuelve la identidad admin del request (o `null` sin sesión válida). */
export async function resolveAdminIdentity(
  headers: Record<string, string> | null | undefined,
): Promise<AdminIdentity | null> {
  const token = extractToken(headers);
  if (!token) return null;

  const res = await getMe({ client: apiClient, headers: { authorization: `Bearer ${token}` } });
  if (res.error || !res.data) return null;

  return { userId: res.data.id, capabilities: res.data.capabilities };
}

/** true solo si el request trae una identidad válida CON la capability pedida. */
export async function hasAdminCapability(
  headers: Record<string, string> | null | undefined,
  capability: string,
): Promise<boolean> {
  const identity = await resolveAdminIdentity(headers);
  return identity?.capabilities.includes(capability) ?? false;
}
