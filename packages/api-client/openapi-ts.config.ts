import { defineConfig } from "@hey-api/openapi-ts";

// Genera el SDK tipado + hooks TanStack Query desde el OpenAPI del backend (ADR 24, §4).
// `make openapi` vuelca apps/api/openapi.json y corre este generador.
export default defineConfig({
  input: "../../apps/api/openapi.json", // o http://localhost:8005/openapi.json
  output: "src/generated",
  client: "@hey-api/client-fetch", // en openapi-ts 0.53 el cliente HTTP va aquí, no en plugins
  plugins: ["@tanstack/react-query", "zod"],
});
