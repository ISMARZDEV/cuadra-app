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

// Header Authorization para las llamadas autenticadas (client-side). Lee el token vigente.
export function authHeaders(): Record<string, string> {
  return cache.token ? { Authorization: `Bearer ${cache.token}` } : {};
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
