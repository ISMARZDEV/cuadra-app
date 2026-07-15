import {
  Apple,
  Baby,
  Beef,
  Candy,
  Coffee,
  Croissant,
  CupSoda,
  Droplet,
  Ham,
  Milk,
  PawPrint,
  Pencil,
  Pill,
  ShoppingBasket,
  Soup,
  Sparkles,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";

// Ícono Lucide por slug de categoría/subcategoría (Imagen #3 y #6). Fallback: canasta.
// Repetir íconos entre subcategorías es aceptable (decisión del usuario) hasta que haya un
// ícono propio por categoría administrable desde el panel (ver Categorias_y_Subcategorias.md).
const ICONS: Record<string, LucideIcon> = {
  // Categorías tope
  alcohol: Wine,
  bebes: Baby,
  bebidas: CupSoda,
  "carnes-pescados": Beef,
  "cuidado-del-hogar": Sparkles,
  "cuidado-personal": Sparkles,
  "despensa-abarrotes": Wheat,
  "embutidos-delicatessen": Ham,
  "escolares-oficina": Pencil,
  "frutas-verduras": Apple,
  "lacteos-huevos": Milk,
  mascotas: PawPrint,
  "panaderia-tortilleria": Croissant,
  "salud-farmacia": Pill,
  "snacks-dulces": Candy,
  // Subcategorías de Despensa & Abarrotes (seed actual)
  "aceite-vinagre": Droplet,
  "arroz-granos-legumbres": Wheat,
  cafe: Coffee,
  "caldos-sopas": Soup,
  "chocolate-para-beber": Coffee,
  "condimentos-especias": Sparkles,
  "desayuno-cereal": Wheat,
  endulzantes: Candy,
  harinas: Wheat,
  pastas: Wheat,
  reposteria: Croissant,
  salsas: Droplet,
  "semillas-frutos-secos": Apple,
  "te-infusiones": Coffee,
};

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? ShoppingBasket;
}
