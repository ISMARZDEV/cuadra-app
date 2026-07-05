import { devLogin } from "@cuadra/api-client";
import { useSyncExternalStore } from "react";

import { apiClient } from "@/lib/api";

// Auth mínima del portal (dev): login por email vía /identity/dev-login → JWT en localStorage.
// En prod el token lo emite el IdP externo (dev-login devuelve 404). Mismo patrón SSR-safe que la
// lista (useSyncExternalStore: servidor = no autenticado, cliente re-lee tras hidratar).

interface AuthState {
  token: string | null;
  email: string | null;
}

const KEY = "cuadra:auth";
const EMPTY: AuthState = { token: null, email: null };

let cache: AuthState = read();
const listeners = new Set<() => void>();

function read(): AuthState {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthState) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: AuthState): void {
  cache = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

// Fuente del token para las llamadas autenticadas. Por defecto = el cache del dev-login; el
// bridge de Clerk lo sobreescribe con `getToken` (async, token fresco por request: los de Clerk
// son de vida corta). Dual-mode sin import circular (ni el bridge ni el componente se importan aquí).
type TokenGetter = () => string | null | Promise<string | null>;
let tokenGetter: TokenGetter = () => cache.token;

export function registerTokenGetter(getter: TokenGetter): void {
  tokenGetter = getter;
}

// Header Authorization para las llamadas autenticadas (client-side). Async: el getter de Clerk lo es.
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await tokenGetter();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function login(email: string): Promise<boolean> {
  const res = await devLogin({ client: apiClient, body: { email } });
  if (res.error || !res.data) return false;
  commit({ token: res.data.access_token, email });
  return true;
}

function logout(): void {
  commit(EMPTY);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAuth() {
  const state = useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY,
  );
  return { ...state, isAuthed: Boolean(state.token), login, logout };
}
