import { createClient, createConfig } from "@hey-api/client-fetch";

// Cliente HTTP dedicado de la web → apps/api. En SSR (Node) el baseUrl DEBE ser absoluto.
// VITE_API_BASE_URL apunta a prod; default = backend local (`make api`, :8005).
export const apiClient = createClient(
  createConfig({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8005",
  }),
);
