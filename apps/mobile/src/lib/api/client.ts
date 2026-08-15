import { client } from "@cuadra/api-client";
import Constants from "expo-constants";

import { resolveApiBaseUrl } from "./base-url";

// Configures the generated SDK's singleton client ONCE (cuadra-mobile skill).
// Base URL from env; the Bearer token is injected per-request via an interceptor that pulls a
// FRESH token from a registered getter. Two auth modes register their getter here (no circular
// import — neither the store nor the Clerk bridge is imported from this module):
//   - dev-login: a STATIC token (setApiAuthToken) — the seeded JWT doesn't rotate.
//   - Clerk: an ASYNC getter (registerTokenGetter(getToken)) — Clerk session tokens are
//     short-lived (~60s) and refreshed on demand, so we must fetch a fresh one PER request and
//     never cache it ourselves.

type TokenGetter = () => string | null | Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

// Register the token source. Clerk passes its async `getToken`; dev-login goes via setApiAuthToken.
export function registerTokenGetter(getter: TokenGetter | null) {
  tokenGetter = getter;
}

// Back-compat convenience for the dev-login store: wrap a static token as a getter.
export function setApiAuthToken(token: string | null) {
  tokenGetter = token === null ? null : () => token;
}

// Resolve the current token for callers OUTSIDE the SDK interceptor — e.g. the SSE chat stream
// (expo/fetch), which doesn't go through the generated client and must set its own Authorization.
// Async because the Clerk getter is async (fetches/refreshes the session token).
export async function getApiAuthToken(): Promise<string | null> {
  return tokenGetter ? await tokenGetter() : null;
}

// Host de quien sirve el bundle (Metro). `hostUri` viene como "10.0.0.89:8087" — nos quedamos con
// la máquina y descartamos su puerto, que es el de Metro y no el de la API.
// `expoGoConfig.debuggerHost` es el nombre viejo del mismo dato; se mira de segundo por si algún
// entorno todavía lo reporta ahí. Fuera de Metro (build de release) no hay ninguno de los dos.
function metroHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
  return host ? host : null;
}

// En DESARROLLO la IP se DEDUCE en vez de leerse del `.env`. Ver `base-url.ts` para el porqué: la
// que se hornea en el bundle caduca cuando el DHCP cambia la IP del Mac, y el fallo se disfraza de
// error del código.
export const API_BASE_URL = resolveApiBaseUrl({
  configured: process.env.EXPO_PUBLIC_API_URL,
  metroHost: metroHost(),
  isDev: __DEV__,
});
if (!API_BASE_URL && __DEV__) {
  console.warn("[api] Sin URL de API: ni EXPO_PUBLIC_API_URL ni host de Metro. Las peticiones van a fallar.");
}
if (__DEV__) {
  console.log(`[api] baseUrl = ${API_BASE_URL}`);
}

client.setConfig({ baseUrl: API_BASE_URL });

client.interceptors.request.use(async (request) => {
  const token = await getApiAuthToken();
  if (token) {
    request.headers.set("Authorization", `Bearer ${token}`);
  }
  return request;
});
