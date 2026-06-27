import { client } from "@cuadra/api-client";

// Configures the generated SDK's singleton client ONCE (cuadra-mobile skill).
// Base URL from env; the Bearer token is injected per-request via an interceptor
// that reads a module-level holder — the auth store calls setApiAuthToken() on
// login/restore/logout. Keeping the token here (not importing the store) avoids a
// circular dependency (the store imports devLogin + setApiAuthToken from here).

let authToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl && __DEV__) {
  console.warn("[api] EXPO_PUBLIC_API_URL is not set — requests will fail.");
}

client.setConfig({ baseUrl });

client.interceptors.request.use((request) => {
  if (authToken) {
    request.headers.set("Authorization", `Bearer ${authToken}`);
  }
  return request;
});
