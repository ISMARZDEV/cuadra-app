import type { Locale } from "./config";

// Catálogo de strings de la UI (chrome). Los DATOS (nombres de producto, precios) NO se traducen:
// son del catálogo dominicano y viajan tal cual. Solo se traduce la interfaz + meta/OG.
type MessageKey =
  // nav corporativo (Imagen #3)
  | "nav.save"
  | "nav.news"
  | "nav.about"
  | "nav.pricing"
  | "nav.download"
  | "nav.supermarkets"
  | "nav.financial"
  | "nav.investments"
  | "nav.insurance"
  | "theme.toggle"
  // landing corporativo
  | "corp.title"
  | "corp.subtitle"
  | "corp.askPlaceholder"
  | "corp.ask"
  | "corp.whyTag"
  | "corp.whyTitle"
  | "corp.whySubtitle"
  // Supermercados (Save)
  | "super.title"
  | "super.subtitle"
  | "super.searchPlaceholder"
  | "super.bestOffers"
  | "super.popular"
  | "super.offersByStore"
  | "super.inspiration"
  | "super.bestValue"
  | "super.seeAll"
  | "super.categories"
  // búsqueda
  | "search.title"
  | "search.placeholder"
  | "search.button"
  | "search.resultsFor"
  // producto
  | "product.bestPriceAt"
  | "product.addToList"
  | "product.alternatives"
  | "product.related"
  | "product.history"
  | "product.properties"
  | "product.title"
  | "product.metaDescription"
  // comparación
  | "compare.store"
  | "compare.price"
  | "compare.vsBest"
  | "compare.best"
  | "compare.goToStore"
  // categorías
  | "categories.title"
  | "category.products"
  | "category.filters"
  // error
  | "error.notFoundTitle"
  | "error.notFoundBody"
  | "error.genericTitle"
  | "error.genericBody"
  | "error.backHome"
  // genéricos
  | "common.comingSoon"
  | "footer.tagline"
  | "meta.home.description";

const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  es: {
    "nav.save": "Save",
    "nav.news": "Noticias",
    "nav.about": "Nosotros",
    "nav.pricing": "Planes y precios",
    "nav.download": "Descargar App",
    "nav.supermarkets": "Supermercados",
    "nav.financial": "Productos Financieros",
    "nav.investments": "Inversiones",
    "nav.insurance": "Seguros",
    "theme.toggle": "Cambiar tema",
    "corp.title": "El futuro es IA. Administra tu dinero",
    "corp.subtitle":
      "El éxito financiero empieza con pequeños hábitos. Cuadra te ayuda a registrar, analizar y organizar tus finanzas.",
    "corp.askPlaceholder": "Pregúntale algo a Cuadra IA…",
    "corp.ask": "Preguntar",
    "corp.whyTag": "¿Por qué Cuadra?",
    "corp.whyTitle": "La única herramienta de gestión financiera que necesitas",
    "corp.whySubtitle":
      "Tu dinero merece mejor gestión. Cuadra convierte tus transacciones diarias en información clara.",
    "super.title": "Busca, compara y ahorra",
    "super.subtitle": "Encuentra el supermercado más barato hoy en República Dominicana.",
    "super.searchPlaceholder": "¿Qué quieres comprar hoy?",
    "super.bestOffers": "Mejores ofertas de hoy",
    "super.popular": "Productos populares ahora",
    "super.offersByStore": "Ofertas por supermercado",
    "super.inspiration": "Inspiración",
    "super.bestValue": "Mejor valor por tu dinero",
    "super.seeAll": "Ver todas",
    "super.categories": "Categorías",
    "search.title": "Buscar productos",
    "search.placeholder": "arroz, aceite, leche…",
    "search.button": "Buscar",
    "search.resultsFor": "resultado(s) para",
    "product.bestPriceAt": "Mejor precio en",
    "product.addToList": "Agregar a lista",
    "product.alternatives": "Alternativas del supermercado",
    "product.related": "Productos relacionados",
    "product.history": "Historial de precios",
    "product.properties": "Propiedades",
    "product.title": "{name} — precios en supermercados de {country} | Cuadra Save",
    "product.metaDescription":
      "Compara {name} entre supermercados de {country}. Mejor precio: {price} en {provider}.",
    "compare.store": "Supermercado",
    "compare.price": "Precio",
    "compare.vsBest": "vs. mejor",
    "compare.best": "Mejor precio",
    "compare.goToStore": "Buscar",
    "categories.title": "Todas las categorías",
    "category.products": "productos",
    "category.filters": "Filtros",
    "error.notFoundTitle": "Producto no encontrado",
    "error.notFoundBody": "No encontramos ese producto. Puede que ya no esté en catálogo.",
    "error.genericTitle": "Algo salió mal",
    "error.genericBody": "Ocurrió un error. Intentá de nuevo en un momento.",
    "error.backHome": "← Volver al inicio",
    "common.comingSoon": "Próximamente",
    "footer.tagline": "Precios de catálogo online",
    "meta.home.description": "Cuadra — administra tu dinero y compara precios de supermercado.",
  },
  en: {
    "nav.save": "Save",
    "nav.news": "News",
    "nav.about": "About us",
    "nav.pricing": "Plans and pricing",
    "nav.download": "Download App",
    "nav.supermarkets": "Supermarkets",
    "nav.financial": "Financial Products",
    "nav.investments": "Investments",
    "nav.insurance": "Insurance",
    "theme.toggle": "Toggle theme",
    "corp.title": "The Future is AI. Manage Your Money",
    "corp.subtitle":
      "Financial success begins with small habits. Cuadra helps you track, analyze, and organize your finances.",
    "corp.askPlaceholder": "Ask Cuadra AI something…",
    "corp.ask": "Ask",
    "corp.whyTag": "Why Cuadra?",
    "corp.whyTitle": "The only financial management tool you need",
    "corp.whySubtitle":
      "Your money deserves better management. Cuadra turns your daily transactions into clear information.",
    "super.title": "Search, compare and save",
    "super.subtitle": "Find the cheapest supermarket today in the Dominican Republic.",
    "super.searchPlaceholder": "What do you want to buy today?",
    "super.bestOffers": "Best offers today",
    "super.popular": "Popular products now",
    "super.offersByStore": "Offers by supermarket",
    "super.inspiration": "Inspiration",
    "super.bestValue": "Best value for your money",
    "super.seeAll": "See all",
    "super.categories": "Categories",
    "search.title": "Search products",
    "search.placeholder": "rice, oil, milk…",
    "search.button": "Search",
    "search.resultsFor": "result(s) for",
    "product.bestPriceAt": "Best price at",
    "product.addToList": "Add to list",
    "product.alternatives": "Supermarket alternatives",
    "product.related": "Related products",
    "product.history": "Price history",
    "product.properties": "Properties",
    "product.title": "{name} — supermarket prices in {country} | Cuadra Save",
    "product.metaDescription":
      "Compare {name} across {country} supermarkets. Best price: {price} at {provider}.",
    "compare.store": "Supermarket",
    "compare.price": "Price",
    "compare.vsBest": "vs. best",
    "compare.best": "Best price",
    "compare.goToStore": "Go to store",
    "categories.title": "All categories",
    "category.products": "products",
    "category.filters": "Filters",
    "error.notFoundTitle": "Product not found",
    "error.notFoundBody": "We couldn't find that product. It may no longer be in the catalog.",
    "error.genericTitle": "Something went wrong",
    "error.genericBody": "An error occurred. Please try again in a moment.",
    "error.backHome": "← Back to home",
    "common.comingSoon": "Coming soon",
    "footer.tagline": "Online catalog prices",
    "meta.home.description": "Cuadra — manage your money and compare supermarket prices.",
  },
  pt: {
    "nav.save": "Save",
    "nav.news": "Notícias",
    "nav.about": "Sobre nós",
    "nav.pricing": "Planos e preços",
    "nav.download": "Baixar App",
    "nav.supermarkets": "Supermercados",
    "nav.financial": "Produtos Financeiros",
    "nav.investments": "Investimentos",
    "nav.insurance": "Seguros",
    "theme.toggle": "Alternar tema",
    "corp.title": "O futuro é IA. Gerencie seu dinheiro",
    "corp.subtitle":
      "O sucesso financeiro começa com pequenos hábitos. A Cuadra ajuda você a registrar, analisar e organizar suas finanças.",
    "corp.askPlaceholder": "Pergunte algo à Cuadra IA…",
    "corp.ask": "Perguntar",
    "corp.whyTag": "Por que Cuadra?",
    "corp.whyTitle": "A única ferramenta de gestão financeira que você precisa",
    "corp.whySubtitle":
      "Seu dinheiro merece melhor gestão. A Cuadra transforma suas transações diárias em informação clara.",
    "super.title": "Busque, compare e economize",
    "super.subtitle": "Encontre o supermercado mais barato hoje na República Dominicana.",
    "super.searchPlaceholder": "O que você quer comprar hoje?",
    "super.bestOffers": "Melhores ofertas de hoje",
    "super.popular": "Produtos populares agora",
    "super.offersByStore": "Ofertas por supermercado",
    "super.inspiration": "Inspiração",
    "super.bestValue": "Melhor valor pelo seu dinheiro",
    "super.seeAll": "Ver todas",
    "super.categories": "Categorias",
    "search.title": "Buscar produtos",
    "search.placeholder": "arroz, óleo, leite…",
    "search.button": "Buscar",
    "search.resultsFor": "resultado(s) para",
    "product.bestPriceAt": "Melhor preço em",
    "product.addToList": "Adicionar à lista",
    "product.alternatives": "Alternativas do supermercado",
    "product.related": "Produtos relacionados",
    "product.history": "Histórico de preços",
    "product.properties": "Propriedades",
    "product.title": "{name} — preços em supermercados em {country} | Cuadra Save",
    "product.metaDescription":
      "Compare {name} entre supermercados em {country}. Melhor preço: {price} em {provider}.",
    "compare.store": "Supermercado",
    "compare.price": "Preço",
    "compare.vsBest": "vs. melhor",
    "compare.best": "Melhor preço",
    "compare.goToStore": "Ir à loja",
    "categories.title": "Todas as categorias",
    "category.products": "produtos",
    "category.filters": "Filtros",
    "error.notFoundTitle": "Produto não encontrado",
    "error.notFoundBody": "Não encontramos esse produto. Talvez não esteja mais no catálogo.",
    "error.genericTitle": "Algo deu errado",
    "error.genericBody": "Ocorreu um erro. Tente novamente em um momento.",
    "error.backHome": "← Voltar ao início",
    "common.comingSoon": "Em breve",
    "footer.tagline": "Preços de catálogo online",
    "meta.home.description": "Cuadra — gerencie seu dinheiro e compare preços de supermercado.",
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
