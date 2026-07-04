import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";

// Vike (SSR/SSG sobre Vite) + React. El SEO viene del render server-side por página
// (doc 06 §9). El plugin `vike` hookea el dev server y el build (cliente + servidor).
export default defineConfig({
  plugins: [react(), vike()],
});
