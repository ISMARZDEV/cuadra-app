import { devLogin } from "@cuadra/api-client";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { setApiAuthToken } from "@/lib/api/client";

// Auth store — dev-login only for now (no external IdP yet; cuadra-mobile skill §4).
// Persists the JWT in secure storage and mirrors it into the SDK client (Bearer).
// Prod swaps signInDev for the external IdP.

const TOKEN_KEY = "cuadra.access_token";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  token: string | null;
  status: AuthStatus;
  /** Restore a persisted session on app start. */
  restore: () => Promise<void>;
  /** Dev-only login: exchanges a seeded email for a JWT. */
  signInDev: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  status: "loading",

  restore: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    setApiAuthToken(token);
    set({ token, status: token ? "authenticated" : "unauthenticated" });
  },

  signInDev: async (email) => {
    const { data } = await devLogin({ body: { email } });
    const token = data?.access_token;
    if (!token) throw new Error("dev-login no devolvió access_token");
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setApiAuthToken(token);
    set({ token, status: "authenticated" });
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setApiAuthToken(null);
    set({ token: null, status: "unauthenticated" });
  },
}));
