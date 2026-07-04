import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn(): combina clases condicionales (clsx) y resuelve conflictos de Tailwind (tailwind-merge).
// La usan todos los componentes shadcn/ui.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Slug URL-safe desde un nombre de categoría ("Despensa & Abarrotes" → "despensa-abarrotes").
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
