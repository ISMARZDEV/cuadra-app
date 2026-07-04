import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";

// Vike (SSR sobre Vite) + React + Tailwind v4 (shadcn/ui). Alias @ → src (shadcn importa @/…).
export default defineConfig({
  plugins: [tailwindcss(), react(), vike()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
