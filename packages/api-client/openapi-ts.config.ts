import { defineConfig } from "@hey-api/openapi-ts";

// Genera el SDK tipado + hooks TanStack Query desde el OpenAPI del backend (ADR 24, §4).
// `make openapi` vuelca apps/api/openapi.json y corre este generador.
export default defineConfig({
  input: "../../apps/api/openapi.json", // o http://localhost:8005/openapi.json
  output: "src/generated",
  plugins: ["@hey-api/client-fetch", "@tanstack/react-query", "zod"],
});
