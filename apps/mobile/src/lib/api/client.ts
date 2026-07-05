import { client } from "@cuadra/api-client";

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

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_BASE_URL && __DEV__) {
  console.warn("[api] EXPO_PUBLIC_API_URL is not set — requests will fail.");
}

client.setConfig({ baseUrl: API_BASE_URL });

client.interceptors.request.use(async (request) => {
  const token = await getApiAuthToken();
  if (token) {
    request.headers.set("Authorization", `Bearer ${token}`);
  }
  return request;
});
