import { getMe } from "@cuadra/api-client";

import { ADMIN_RESOURCES } from "@/features/admin/shell/admin-resource";
import { isLocale, type Locale } from "@/i18n/config";
import { apiClient } from "@/lib/api";

const ADMIN_LOCALE_COOKIE = "admin_locale";

/** Locale elegido en el switcher del admin (cookie SSR-readable), o null. El `+data.ts` del admin lo
 * prioriza sobre `MeResponse.locale` → el switcher es admin-scoped (no cambia la cuenta global). */
export function extractAdminLocale(
  headers: Record<string, string> | null | undefined,
): Locale | null {
  const cookieHeader = headers?.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_LOCALE_COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(ADMIN_LOCALE_COOKIE.length + 1)) : undefined;
  return isLocale(value) ? value : null;
}

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
// Modo dev-login (sin Clerk): el token vive en localStorage, inalcanzable server-side — por eso
// `syncSessionCookie` (use-auth, 10.D) lo ESPEJA en la cookie `__session` al hacer login, así este
// gate SSR lo ve. Combinado con `dev-login {role:"super_admin"}` (10.B), el admin es visible
// localmente sin Clerk. En modo Clerk, Clerk es dueño de `__session` (su JWT RS256).
const SESSION_COOKIE = "__session";

// Exportada (no solo interna): `pages/admin/review-queue/+data.ts` (batch 2·11) la reutiliza para
// adjuntar el MISMO token de sesión a la llamada SSR autenticada de `listReviewQueue` — nunca un
// segundo mecanismo de extracción de auth.
export function extractToken(headers: Record<string, string> | null | undefined): string | null {
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
  /** Locale crudo de `MeResponse` (`string`, sin validar contra el union `Locale` de i18n —
   * `+data.ts` lo normaliza con `isLocale` + fallback a `DEFAULT_LOCALE` antes de exponerlo). */
  locale: string;
  /** `MeResponse.name` — threadeado igual que `locale`, para el user chip de `AdminTopBar`
   * (batch 4). `MeResponse.name` es siempre `string` (no-nullable en el DTO). */
  name: string;
  /** `MeResponse.email` — nullable en el DTO; threadeado por si un follow-up lo necesita
   * (tooltip/dropdown del user chip). No se renderiza todavía. */
  email: string | null;
}

/** Resuelve la identidad admin del request (o `null` sin sesión válida). */
export async function resolveAdminIdentity(
  headers: Record<string, string> | null | undefined,
): Promise<AdminIdentity | null> {
  const token = extractToken(headers);
  if (!token) return null;

  const res = await getMe({ client: apiClient, headers: { authorization: `Bearer ${token}` } });
  if (res.error || !res.data) return null;

  return {
    userId: res.data.id,
    capabilities: res.data.capabilities,
    locale: res.data.locale,
    name: res.data.name,
    email: res.data.email,
  };
}

/** true solo si el request trae una identidad válida CON la capability pedida. */
export async function hasAdminCapability(
  headers: Record<string, string> | null | undefined,
  capability: string,
): Promise<boolean> {
  const identity = await resolveAdminIdentity(headers);
  return identity?.capabilities.includes(capability) ?? false;
}

/** true si el request resuelve una identidad con AL MENOS una capability de algún `AdminResource`.
 * Gate de ENTRADA robusto para `pages/admin/+guard.ts` (10.D): independiente del orden de
 * `ADMIN_RESOURCES` (antes gateaba con `[0]`); cada subárbol re-chequea su capability específica. */
export async function hasAnyAdminCapability(
  headers: Record<string, string> | null | undefined,
): Promise<boolean> {
  const identity = await resolveAdminIdentity(headers);
  if (!identity) return false;
  const adminCaps = new Set(ADMIN_RESOURCES.map((r) => r.capability));
  return identity.capabilities.some((c) => adminCaps.has(c));
}
