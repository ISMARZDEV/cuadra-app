import type { Locale } from "./config";

// Catálogo de strings de la UI (chrome). Los DATOS (nombres de producto, precios) NO se traducen:
// son del catálogo dominicano y viajan tal cual. Solo se traduce la interfaz + meta/OG.
type MessageKey =
  | "nav.search"
  | "home.title"
  | "home.subtitle"
  | "home.searchPlaceholder"
  | "search.button"
  | "search.title"
  | "search.placeholder"
  | "search.resultsFor"
  | "product.bestPriceAt"
  | "compare.store"
  | "compare.price"
  | "compare.vsBest"
  | "compare.best"
  | "footer.tagline"
  | "error.notFoundTitle"
  | "error.notFoundBody"
  | "error.genericTitle"
  | "error.genericBody"
  | "error.backHome"
  | "meta.home.description"
  | "product.title"
  | "product.metaDescription";

const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  es: {
    "nav.search": "Buscar",
    "home.title": "Compara precios de supermercado",
    "home.subtitle":
      "Encuentra en qué supermercado te sale más barata tu compra. Precios de catálogo.",
    "home.searchPlaceholder": "Busca un producto… (arroz, aceite, leche)",
    "search.button": "Buscar",
    "search.title": "Buscar productos",
    "search.placeholder": "arroz, aceite, leche…",
    "search.resultsFor": "resultado(s) para",
    "product.bestPriceAt": "Mejor precio en",
    "compare.store": "Supermercado",
    "compare.price": "Precio",
    "compare.vsBest": "vs. mejor",
    "compare.best": "Mejor precio",
    "footer.tagline": "Precios de catálogo online",
    "error.notFoundTitle": "Producto no encontrado",
    "error.notFoundBody": "No encontramos ese producto. Puede que ya no esté en catálogo.",
    "error.genericTitle": "Algo salió mal",
    "error.genericBody": "Ocurrió un error. Intentá de nuevo en un momento.",
    "error.backHome": "← Volver al inicio",
    "meta.home.description": "Compara el precio de tu compra entre supermercados.",
    "product.title": "{name} — precios en supermercados de {country} | Cuadra Save",
    "product.metaDescription":
      "Compara {name} entre supermercados de {country}. Mejor precio: {price} en {provider}.",
  },
  en: {
    "nav.search": "Search",
    "home.title": "Compare supermarket prices",
    "home.subtitle":
      "Find which supermarket has the cheapest cart. Catalog prices.",
    "home.searchPlaceholder": "Search a product… (rice, oil, milk)",
    "search.button": "Search",
    "search.title": "Search products",
    "search.placeholder": "rice, oil, milk…",
    "search.resultsFor": "result(s) for",
    "product.bestPriceAt": "Best price at",
    "compare.store": "Supermarket",
    "compare.price": "Price",
    "compare.vsBest": "vs. best",
    "compare.best": "Best price",
    "footer.tagline": "Online catalog prices",
    "error.notFoundTitle": "Product not found",
    "error.notFoundBody": "We couldn't find that product. It may no longer be in the catalog.",
    "error.genericTitle": "Something went wrong",
    "error.genericBody": "An error occurred. Please try again in a moment.",
    "error.backHome": "← Back to home",
    "meta.home.description": "Compare the price of your cart across supermarkets.",
    "product.title": "{name} — supermarket prices in {country} | Cuadra Save",
    "product.metaDescription":
      "Compare {name} across {country} supermarkets. Best price: {price} at {provider}.",
  },
  pt: {
    "nav.search": "Buscar",
    "home.title": "Compare preços de supermercado",
    "home.subtitle":
      "Descubra em qual supermercado sua compra sai mais barata. Preços de catálogo.",
    "home.searchPlaceholder": "Busque um produto… (arroz, óleo, leite)",
    "search.button": "Buscar",
    "search.title": "Buscar produtos",
    "search.placeholder": "arroz, óleo, leite…",
    "search.resultsFor": "resultado(s) para",
    "product.bestPriceAt": "Melhor preço em",
    "compare.store": "Supermercado",
    "compare.price": "Preço",
    "compare.vsBest": "vs. melhor",
    "compare.best": "Melhor preço",
    "footer.tagline": "Preços de catálogo online",
    "error.notFoundTitle": "Produto não encontrado",
    "error.notFoundBody": "Não encontramos esse produto. Talvez não esteja mais no catálogo.",
    "error.genericTitle": "Algo deu errado",
    "error.genericBody": "Ocorreu um erro. Tente novamente em um momento.",
    "error.backHome": "← Voltar ao início",
    "meta.home.description": "Compare o preço da sua compra entre supermercados.",
    "product.title": "{name} — preços em supermercados em {country} | Cuadra Save",
    "product.metaDescription":
      "Compare {name} entre supermercados em {country}. Melhor preço: {price} em {provider}.",
  },
};

export type { MessageKey };

export function translate(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}

// Igual que translate pero interpola {placeholders} — para títulos/descripciones por producto.
export function format(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string>,
): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}
