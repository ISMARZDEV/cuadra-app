import {
  Apple,
  Baby,
  Beef,
  Candy,
  Croissant,
  CupSoda,
  Ham,
  Milk,
  PawPrint,
  Pencil,
  Pill,
  ShoppingBasket,
  Sparkles,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";

// Ícono Lucide por slug de categoría tope (Imagen #3). Fallback: canasta.
const ICONS: Record<string, LucideIcon> = {
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
};

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? ShoppingBasket;
}
