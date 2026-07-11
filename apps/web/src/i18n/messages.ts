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
  | "product.priceFrom"
  | "product.onlineDisclaimer"
  | "product.feedback"
  | "product.reportProblem"
  | "product.suggestCategory"
  | "product.moreFromBrand"
  | "product.propType"
  | "product.propBrand"
  | "product.propQuality"
  | "history.range1m"
  | "history.range3m"
  | "history.rangeAll"
  | "history.byStore"
  | "history.empty"
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
  | "category.stores"
  | "category.brands"
  | "category.searchBrand"
  | "category.priceMin"
  | "category.priceMax"
  | "category.apply"
  | "category.clear"
  | "category.sortBy"
  | "category.empty"
  | "category.popular"
  | "category.viewMode"
  | "category.viewMode.loadMore"
  | "category.viewMode.pages"
  | "category.loadMore"
  | "category.seen"
  | "category.goToPage"
  | "category.go"
  | "category.facetMore"
  | "category.facetLess"
  | "category.upTo"
  | "category.orMore"
  | "product.stores"
  | "sort.price"
  | "sort.unitPrice"
  | "sort.name"
  | "sort.popular"
  // lista de compra (local)
  | "list.title"
  | "list.empty"
  | "list.total"
  | "list.remove"
  | "list.keepShopping"
  | "list.items"
  | "list.disclaimer"
  | "list.view"
  // auth + alertas (G4)
  | "nav.login"
  | "nav.logout"
  | "login.title"
  | "login.hint"
  | "login.submit"
  | "alerts.title"
  | "alerts.notifyMe"
  | "alerts.watching"
  | "alerts.stopWatching"
  | "alerts.subscriptions"
  | "alerts.notifications"
  | "alerts.noAlerts"
  | "alerts.noNotifications"
  | "alerts.unsubscribe"
  | "alerts.loginToWatch"
  | "alerts.droppedFromTo"
  // error
  | "error.notFoundTitle"
  | "error.notFoundBody"
  | "error.genericTitle"
  | "error.genericBody"
  | "error.backHome"
  // genéricos
  | "common.comingSoon"
  | "footer.tagline"
  | "meta.home.description"
  // admin sidebar (Figma nodo 483:13776) — namespace propio, admin es SSR-scoped
  // y usa `useAdminI18n(locale)` (locale explícito vía AdminShellData), NO `usePageI18n`.
  | "admin.nav.section.menu"
  | "admin.nav.section.users"
  | "admin.nav.section.news"
  | "admin.nav.section.save"
  | "admin.nav.dashboard"
  | "admin.nav.dashboard.users"
  | "admin.nav.dashboard.news"
  | "admin.nav.dashboard.save"
  | "admin.nav.users.support"
  | "admin.nav.users.management"
  | "admin.nav.news.publications"
  | "admin.nav.save.supermarket"
  | "admin.nav.save.metrics"
  | "admin.nav.save.reviewQueue"
  | "admin.nav.save.providers"
  | "admin.nav.save.sources"
  | "admin.nav.save.basket"
  | "admin.nav.save.financialProducts"
  | "admin.nav.wip"
  | "admin.nav.footer.feedback"
  | "admin.nav.footer.help"
  // Batch 3 — componentes de dominio (CategoryBadge / MethodBadge)
  | "admin.category.none"
  | "admin.method.ean"
  | "admin.method.trgm"
  | "admin.method.vector"
  | "admin.method.hybrid"
  | "admin.method.llm"
  | "admin.method.human"
  | "admin.topbar.notifications"
  | "admin.topbar.settings"
  // Batch 5 — Toolbar (Cola de revisión)
  | "admin.toolbar.search.placeholder"
  | "admin.toolbar.filters"
  | "admin.toolbar.filter.provider"
  | "admin.toolbar.filter.provider.placeholder"
  | "admin.toolbar.filter.provider.all"
  | "admin.toolbar.filter.method"
  | "admin.toolbar.filter.method.all"
  | "admin.toolbar.filter.confidenceMin"
  | "admin.toolbar.filter.confidenceMax"
  | "admin.toolbar.filter.confidence"
  | "admin.toolbar.filter.confidence.min"
  | "admin.toolbar.filter.confidence.max"
  | "admin.toolbar.filter.orderBy"
  | "admin.toolbar.filter.orderBy.uncertainty"
  | "admin.toolbar.filter.orderBy.createdAt"
  | "admin.toolbar.filters.clear"
  | "admin.toolbar.filters.apply"
  | "admin.toolbar.view.list"
  | "admin.toolbar.view.grid"
  | "admin.toolbar.export"
  | "admin.toolbar.showAll"
  | "admin.toolbar.showAll.optionAll"
  | "admin.toolbar.showAll.optionUncertain"
  | "admin.toolbar.actions"
  | "admin.toolbar.actions.approve"
  | "admin.toolbar.actions.reject"
  // Batch 6 — Restyle de la tabla (Cola de revisión)
  | "admin.reviewQueue.title"
  | "admin.reviewQueue.info"
  | "admin.reviewQueue.selectAll"
  | "admin.reviewQueue.selectedSuffix"
  | "admin.reviewQueue.selectRow"
  | "admin.reviewQueue.empty"
  | "admin.reviewQueue.noImage"
  | "admin.reviewQueue.noDescription"
  | "admin.reviewQueue.column.info"
  | "admin.reviewQueue.column.product"
  | "admin.reviewQueue.column.size"
  | "admin.reviewQueue.column.weightType"
  | "admin.reviewQueue.column.description"
  | "admin.reviewQueue.column.category"
  | "admin.reviewQueue.column.brand"
  | "admin.reviewQueue.column.store"
  | "admin.reviewQueue.column.method"
  | "admin.reviewQueue.column.matchDate"
  | "admin.reviewQueue.column.actions"
  | "admin.reviewQueue.actions.menuLabel"
  | "admin.reviewQueue.actions.view"
  | "admin.reviewQueue.actions.edit"
  | "admin.reviewQueue.actions.share"
  | "admin.reviewQueue.actions.delete"
  | "admin.reviewQueue.actions.comingSoon"
  | "admin.reviewQueue.pagination.showing"
  | "admin.reviewQueue.pagination.perPage"
  | "admin.reviewQueue.pagination.of"
  | "admin.reviewQueue.bulkResult.summary"
  | "admin.reviewQueue.bulkResult.failedSuffix"
  | "admin.reviewQueue.sync"
  | "admin.reviewQueue.column.confidence"
  | "admin.reviewQueue.column.image"
  | "admin.reviewQueue.kpi.demo"
  | "admin.reviewQueue.kpi.menu"
  | "admin.reviewQueue.kpi.pending.title"
  | "admin.reviewQueue.kpi.pending.subtitle"
  | "admin.reviewQueue.kpi.pending.unit"
  | "admin.reviewQueue.kpi.autoLink.title"
  | "admin.reviewQueue.kpi.autoLink.subtitle"
  | "admin.reviewQueue.kpi.autoLink.linked"
  | "admin.reviewQueue.kpi.autoLink.pending"
  | "admin.reviewQueue.kpi.methods.title"
  | "admin.reviewQueue.kpi.methods.subtitle"
  | "admin.reviewQueue.kpi.methods.channels"
  | "admin.reviewQueue.kpi.queueTime.title"
  | "admin.reviewQueue.kpi.queueTime.subtitle"
  | "admin.reviewQueue.kpi.queueTime.unit";

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
    "product.priceFrom": "Compara precios desde {min} hasta {max}",
    "product.onlineDisclaimer":
      "Estos precios están disponibles online y pueden variar en la tienda.",
    "product.feedback": "Feedback",
    "product.reportProblem": "Reportar problema",
    "product.suggestCategory": "Sugerir categoría",
    "product.moreFromBrand": "Más de {brand}",
    "product.propType": "Tipo",
    "product.propBrand": "Marca",
    "product.propQuality": "Calidad",
    "history.range1m": "1 Mes",
    "history.range3m": "3 Meses",
    "history.rangeAll": "Todos",
    "history.byStore": "Supermercados",
    "history.empty": "Historial insuficiente por ahora.",
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
    "category.stores": "Supermercados",
    "category.brands": "Marcas",
    "category.searchBrand": "Buscar marca",
    "category.priceMin": "Mín",
    "category.priceMax": "Máx",
    "category.apply": "Aplicar",
    "category.clear": "Limpiar",
    "category.sortBy": "Ordenar por",
    "category.empty": "No hay productos con estos filtros.",
    "category.popular": "Productos populares",
    "category.viewMode": "Vista de resultados",
    "category.viewMode.loadMore": "Cargar más",
    "category.viewMode.pages": "Páginas",
    "category.loadMore": "Ver más",
    "category.seen": "Has visto {shown} de {total} productos",
    "category.goToPage": "Ir a la página:",
    "category.go": "Ir",
    "category.facetMore": "Ver todas ({n})",
    "category.facetLess": "Ver menos",
    "category.upTo": "Hasta",
    "category.orMore": "o más",
    "product.stores": "tiendas",
    "sort.price": "Precio",
    "sort.unitPrice": "Precio/unidad",
    "sort.name": "Nombre",
    "sort.popular": "Popularidad",
    "list.title": "Tu lista de compra",
    "list.empty": "Tu lista está vacía.",
    "list.total": "Total estimado",
    "list.remove": "Quitar",
    "list.keepShopping": "Seguir comprando",
    "list.items": "artículos",
    "list.disclaimer": "Precio del más barato al agregar; puede cambiar en la tienda.",
    "list.view": "Ver lista",
    "nav.login": "Iniciar sesión",
    "nav.logout": "Salir",
    "login.title": "Iniciar sesión",
    "login.hint": "Usa el email de tu cuenta Cuadra (la misma de la app).",
    "login.submit": "Entrar",
    "alerts.title": "Mis alertas",
    "alerts.notifyMe": "Avísame cuando baje",
    "alerts.watching": "Siguiendo precio",
    "alerts.stopWatching": "Dejar de seguir",
    "alerts.subscriptions": "Productos que sigues",
    "alerts.notifications": "Notificaciones",
    "alerts.noAlerts": "No sigues ningún producto todavía.",
    "alerts.noNotifications": "Sin notificaciones por ahora.",
    "alerts.unsubscribe": "Dejar de seguir",
    "alerts.loginToWatch": "Inicia sesión para recibir alertas de precio.",
    "alerts.droppedFromTo": "bajó de {from} a {to} en {store}",
    "error.notFoundTitle": "Producto no encontrado",
    "error.notFoundBody": "No encontramos ese producto. Puede que ya no esté en catálogo.",
    "error.genericTitle": "Algo salió mal",
    "error.genericBody": "Ocurrió un error. Intentá de nuevo en un momento.",
    "error.backHome": "← Volver al inicio",
    "common.comingSoon": "Próximamente",
    "footer.tagline": "Precios de catálogo online",
    "meta.home.description": "Cuadra — administra tu dinero y compara precios de supermercado.",
    "admin.nav.section.menu": "Menú",
    "admin.nav.section.users": "Usuarios",
    "admin.nav.section.news": "Noticias",
    "admin.nav.section.save": "Save",
    "admin.nav.dashboard": "Dashboard",
    "admin.nav.dashboard.users": "Usuarios",
    "admin.nav.dashboard.news": "Noticias",
    "admin.nav.dashboard.save": "Save",
    "admin.nav.users.support": "Soporte a usuarios",
    "admin.nav.users.management": "Gestión de usuarios",
    "admin.nav.news.publications": "Publicaciones",
    "admin.nav.save.supermarket": "Supermercado",
    "admin.nav.save.metrics": "Métricas",
    "admin.nav.save.reviewQueue": "Cola de revisión",
    "admin.nav.save.providers": "Proveedores",
    "admin.nav.save.sources": "Fuentes",
    "admin.nav.save.basket": "Canasta curada",
    "admin.nav.save.financialProducts": "Productos Financieros",
    "admin.nav.wip": "🚧 En construcción — aún no disponible",
    "admin.nav.footer.feedback": "Feedback",
    "admin.nav.footer.help": "Ayuda",
    "admin.category.none": "Sin categoría",
    "admin.method.ean": "EAN",
    "admin.method.trgm": "Similitud de texto",
    "admin.method.vector": "Vector",
    "admin.method.hybrid": "Híbrido",
    "admin.method.llm": "IA",
    "admin.method.human": "Humano",
    "admin.topbar.notifications": "Notificaciones",
    "admin.topbar.settings": "Configuración",
    "admin.toolbar.search.placeholder": "Buscar producto...",
    "admin.toolbar.filters": "Filtros",
    "admin.toolbar.filter.provider": "Proveedor",
    "admin.toolbar.filter.provider.placeholder": "Buscar proveedor...",
    "admin.toolbar.filter.provider.all": "Todos los proveedores",
    "admin.toolbar.filter.method": "Método",
    "admin.toolbar.filter.method.all": "Todos",
    "admin.toolbar.filter.confidenceMin": "Confianza mín.",
    "admin.toolbar.filter.confidenceMax": "Confianza máx.",
    "admin.toolbar.filter.orderBy": "Orden",
    "admin.toolbar.filter.orderBy.uncertainty": "Incertidumbre (default)",
    "admin.toolbar.filter.orderBy.createdAt": "Más antiguo primero",
    "admin.toolbar.filter.confidence": "Confianza (%)",
    "admin.toolbar.filter.confidence.min": "Mínimo",
    "admin.toolbar.filter.confidence.max": "Máximo",
    "admin.toolbar.filters.clear": "Limpiar filtros",
    "admin.toolbar.filters.apply": "Aplicar filtros",
    "admin.toolbar.view.list": "Vista de lista",
    "admin.toolbar.view.grid": "Vista de cuadrícula (próximamente)",
    "admin.toolbar.export": "Exportar (próximamente)",
    "admin.toolbar.showAll": "Mostrar todos",
    "admin.toolbar.showAll.optionAll": "Mostrar todos",
    "admin.toolbar.showAll.optionUncertain": "Solo inciertos",
    "admin.toolbar.actions": "Acciones",
    "admin.toolbar.actions.approve": "Aprobar seleccionados",
    "admin.toolbar.actions.reject": "Rechazar seleccionados",
    "admin.reviewQueue.title": "Cola de revisión",
    "admin.reviewQueue.info": "Información",
    "admin.reviewQueue.selectAll": "Seleccionar todos",
    "admin.reviewQueue.selectedSuffix": "seleccionado(s)",
    "admin.reviewQueue.selectRow": "Seleccionar",
    "admin.reviewQueue.empty": "No hay elementos en la cola con estos filtros.",
    "admin.reviewQueue.noImage": "Sin imagen",
    "admin.reviewQueue.noDescription": "—",
    "admin.reviewQueue.column.info": "Inf. Producto",
    "admin.reviewQueue.column.product": "Producto",
    "admin.reviewQueue.column.size": "Tamaño",
    "admin.reviewQueue.column.weightType": "Peso",
    "admin.reviewQueue.column.description": "Descripción",
    "admin.reviewQueue.column.category": "Categoría",
    "admin.reviewQueue.column.brand": "Marca",
    "admin.reviewQueue.column.store": "Tienda",
    "admin.reviewQueue.column.method": "Método",
    "admin.reviewQueue.column.matchDate": "Fecha del match",
    "admin.reviewQueue.column.actions": "Acciones",
    "admin.reviewQueue.actions.menuLabel": "Más acciones",
    "admin.reviewQueue.actions.view": "Ver",
    "admin.reviewQueue.actions.edit": "Editar",
    "admin.reviewQueue.actions.share": "Compartir",
    "admin.reviewQueue.actions.delete": "Eliminar",
    "admin.reviewQueue.actions.comingSoon": "Próximamente",
    "admin.reviewQueue.pagination.showing": "Mostrar",
    "admin.reviewQueue.pagination.perPage": "por página",
    "admin.reviewQueue.pagination.of": "de",
    "admin.reviewQueue.bulkResult.summary": "aprobado(s)/rechazado(s)",
    "admin.reviewQueue.bulkResult.failedSuffix": "fallaron",
    "admin.reviewQueue.sync": "Sincronizar",
    "admin.reviewQueue.column.confidence": "Confianza",
    "admin.reviewQueue.column.image": "Imagen",
    "admin.reviewQueue.kpi.demo": "Datos de demostración — métricas reales próximamente",
    "admin.reviewQueue.kpi.menu": "Opciones del indicador",
    "admin.reviewQueue.kpi.pending.title": "Cola Pendiente",
    "admin.reviewQueue.kpi.pending.subtitle": "Comparado con la semana pasada",
    "admin.reviewQueue.kpi.pending.unit": "productos",
    "admin.reviewQueue.kpi.autoLink.title": "Auto-link Rate",
    "admin.reviewQueue.kpi.autoLink.subtitle": "Productos enlazados sin humano",
    "admin.reviewQueue.kpi.autoLink.linked": "Auto-enlazados",
    "admin.reviewQueue.kpi.autoLink.pending": "Pendientes",
    "admin.reviewQueue.kpi.methods.title": "Métodos de Match",
    "admin.reviewQueue.kpi.methods.subtitle": "Última semana",
    "admin.reviewQueue.kpi.methods.channels": "Canales activos",
    "admin.reviewQueue.kpi.queueTime.title": "Tiempo en Cola",
    "admin.reviewQueue.kpi.queueTime.subtitle": "Mediana de resolución",
    "admin.reviewQueue.kpi.queueTime.unit": "días",
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
    "product.priceFrom": "Compare prices from {min} to {max}",
    "product.onlineDisclaimer": "These prices are available online and may vary in store.",
    "product.feedback": "Feedback",
    "product.reportProblem": "Report a problem",
    "product.suggestCategory": "Suggest a category",
    "product.moreFromBrand": "More from {brand}",
    "product.propType": "Type",
    "product.propBrand": "Brand",
    "product.propQuality": "Quality",
    "history.range1m": "1 Month",
    "history.range3m": "3 Months",
    "history.rangeAll": "All",
    "history.byStore": "Supermarkets",
    "history.empty": "Not enough price history yet.",
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
    "category.stores": "Supermarkets",
    "category.brands": "Brands",
    "category.searchBrand": "Search brand",
    "category.priceMin": "Min",
    "category.priceMax": "Max",
    "category.apply": "Apply",
    "category.clear": "Clear",
    "category.sortBy": "Sort by",
    "category.empty": "No products match these filters.",
    "category.popular": "Popular products",
    "category.viewMode": "Results view",
    "category.viewMode.loadMore": "Load more",
    "category.viewMode.pages": "Pages",
    "category.loadMore": "See more",
    "category.seen": "You've seen {shown} of {total} products",
    "category.goToPage": "Go to page:",
    "category.go": "Go",
    "category.facetMore": "Show all ({n})",
    "category.facetLess": "Show less",
    "category.upTo": "Up to",
    "category.orMore": "or more",
    "product.stores": "stores",
    "sort.price": "Price",
    "sort.unitPrice": "Price/unit",
    "sort.name": "Name",
    "sort.popular": "Popularity",
    "list.title": "Your shopping list",
    "list.empty": "Your list is empty.",
    "list.total": "Estimated total",
    "list.remove": "Remove",
    "list.keepShopping": "Keep shopping",
    "list.items": "items",
    "list.disclaimer": "Cheapest price when added; may vary in store.",
    "list.view": "View list",
    "nav.login": "Log in",
    "nav.logout": "Log out",
    "login.title": "Log in",
    "login.hint": "Use your Cuadra account email (same as the app).",
    "login.submit": "Log in",
    "alerts.title": "My alerts",
    "alerts.notifyMe": "Notify me when it drops",
    "alerts.watching": "Watching price",
    "alerts.stopWatching": "Stop watching",
    "alerts.subscriptions": "Products you watch",
    "alerts.notifications": "Notifications",
    "alerts.noAlerts": "You're not watching any product yet.",
    "alerts.noNotifications": "No notifications yet.",
    "alerts.unsubscribe": "Unwatch",
    "alerts.loginToWatch": "Log in to get price alerts.",
    "alerts.droppedFromTo": "dropped from {from} to {to} at {store}",
    "error.notFoundTitle": "Product not found",
    "error.notFoundBody": "We couldn't find that product. It may no longer be in the catalog.",
    "error.genericTitle": "Something went wrong",
    "error.genericBody": "An error occurred. Please try again in a moment.",
    "error.backHome": "← Back to home",
    "common.comingSoon": "Coming soon",
    "footer.tagline": "Online catalog prices",
    "meta.home.description": "Cuadra — manage your money and compare supermarket prices.",
    "admin.nav.section.menu": "Menu",
    "admin.nav.section.users": "Users",
    "admin.nav.section.news": "News",
    "admin.nav.section.save": "Save",
    "admin.nav.dashboard": "Dashboard",
    "admin.nav.dashboard.users": "Users",
    "admin.nav.dashboard.news": "News",
    "admin.nav.dashboard.save": "Save",
    "admin.nav.users.support": "User support",
    "admin.nav.users.management": "User management",
    "admin.nav.news.publications": "Posts",
    "admin.nav.save.supermarket": "Supermarket",
    "admin.nav.save.metrics": "Metrics",
    "admin.nav.save.reviewQueue": "Review queue",
    "admin.nav.save.providers": "Providers",
    "admin.nav.save.sources": "Sources",
    "admin.nav.save.basket": "Curated basket",
    "admin.nav.save.financialProducts": "Financial products",
    "admin.nav.wip": "🚧 Under construction — not available yet",
    "admin.nav.footer.feedback": "Feedback",
    "admin.nav.footer.help": "Help",
    "admin.category.none": "No category",
    "admin.method.ean": "EAN",
    "admin.method.trgm": "Text similarity",
    "admin.method.vector": "Vector",
    "admin.method.hybrid": "Hybrid",
    "admin.method.llm": "AI",
    "admin.method.human": "Human",
    "admin.topbar.notifications": "Notifications",
    "admin.topbar.settings": "Settings",
    "admin.toolbar.search.placeholder": "Search product...",
    "admin.toolbar.filters": "Filters",
    "admin.toolbar.filter.provider": "Provider",
    "admin.toolbar.filter.provider.placeholder": "Search provider...",
    "admin.toolbar.filter.provider.all": "All providers",
    "admin.toolbar.filter.method": "Method",
    "admin.toolbar.filter.method.all": "All",
    "admin.toolbar.filter.confidenceMin": "Min. confidence",
    "admin.toolbar.filter.confidenceMax": "Max. confidence",
    "admin.toolbar.filter.orderBy": "Order",
    "admin.toolbar.filter.orderBy.uncertainty": "Uncertainty (default)",
    "admin.toolbar.filter.orderBy.createdAt": "Oldest first",
    "admin.toolbar.filter.confidence": "Confidence (%)",
    "admin.toolbar.filter.confidence.min": "Minimum",
    "admin.toolbar.filter.confidence.max": "Maximum",
    "admin.toolbar.filters.clear": "Clear filters",
    "admin.toolbar.filters.apply": "Apply filters",
    "admin.toolbar.view.list": "List view",
    "admin.toolbar.view.grid": "Grid view (coming soon)",
    "admin.toolbar.export": "Export (coming soon)",
    "admin.toolbar.showAll": "Show all",
    "admin.toolbar.showAll.optionAll": "Show all",
    "admin.toolbar.showAll.optionUncertain": "Uncertain only",
    "admin.toolbar.actions": "Actions",
    "admin.toolbar.actions.approve": "Approve selected",
    "admin.toolbar.actions.reject": "Reject selected",
    "admin.reviewQueue.title": "Review queue",
    "admin.reviewQueue.info": "Information",
    "admin.reviewQueue.selectAll": "Select all",
    "admin.reviewQueue.selectedSuffix": "selected",
    "admin.reviewQueue.selectRow": "Select",
    "admin.reviewQueue.empty": "No items in the queue with these filters.",
    "admin.reviewQueue.noImage": "No image",
    "admin.reviewQueue.noDescription": "—",
    "admin.reviewQueue.column.info": "Product info",
    "admin.reviewQueue.column.product": "Product",
    "admin.reviewQueue.column.size": "Size",
    "admin.reviewQueue.column.weightType": "Unit",
    "admin.reviewQueue.column.description": "Description",
    "admin.reviewQueue.column.category": "Category",
    "admin.reviewQueue.column.brand": "Brand",
    "admin.reviewQueue.column.store": "Store",
    "admin.reviewQueue.column.method": "Method",
    "admin.reviewQueue.column.matchDate": "Match date",
    "admin.reviewQueue.column.actions": "Actions",
    "admin.reviewQueue.actions.menuLabel": "More actions",
    "admin.reviewQueue.actions.view": "View",
    "admin.reviewQueue.actions.edit": "Edit",
    "admin.reviewQueue.actions.share": "Share",
    "admin.reviewQueue.actions.delete": "Delete",
    "admin.reviewQueue.actions.comingSoon": "Coming soon",
    "admin.reviewQueue.pagination.showing": "Show",
    "admin.reviewQueue.pagination.perPage": "per page",
    "admin.reviewQueue.pagination.of": "of",
    "admin.reviewQueue.bulkResult.summary": "approved/rejected",
    "admin.reviewQueue.bulkResult.failedSuffix": "failed",
    "admin.reviewQueue.sync": "Sync",
    "admin.reviewQueue.column.confidence": "Confidence",
    "admin.reviewQueue.column.image": "Image",
    "admin.reviewQueue.kpi.demo": "Demo data — real metrics coming soon",
    "admin.reviewQueue.kpi.menu": "Indicator options",
    "admin.reviewQueue.kpi.pending.title": "Pending Queue",
    "admin.reviewQueue.kpi.pending.subtitle": "Compared to last week",
    "admin.reviewQueue.kpi.pending.unit": "products",
    "admin.reviewQueue.kpi.autoLink.title": "Auto-link Rate",
    "admin.reviewQueue.kpi.autoLink.subtitle": "Products linked without a human",
    "admin.reviewQueue.kpi.autoLink.linked": "Auto-linked",
    "admin.reviewQueue.kpi.autoLink.pending": "Pending",
    "admin.reviewQueue.kpi.methods.title": "Match Methods",
    "admin.reviewQueue.kpi.methods.subtitle": "Last week",
    "admin.reviewQueue.kpi.methods.channels": "Active channels",
    "admin.reviewQueue.kpi.queueTime.title": "Time in Queue",
    "admin.reviewQueue.kpi.queueTime.subtitle": "Median resolution",
    "admin.reviewQueue.kpi.queueTime.unit": "days",
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
    "product.priceFrom": "Compare preços desde {min} até {max}",
    "product.onlineDisclaimer": "Estes preços estão disponíveis online e podem variar na loja.",
    "product.feedback": "Feedback",
    "product.reportProblem": "Reportar problema",
    "product.suggestCategory": "Sugerir categoria",
    "product.moreFromBrand": "Mais de {brand}",
    "product.propType": "Tipo",
    "product.propBrand": "Marca",
    "product.propQuality": "Qualidade",
    "history.range1m": "1 Mês",
    "history.range3m": "3 Meses",
    "history.rangeAll": "Todos",
    "history.byStore": "Supermercados",
    "history.empty": "Histórico insuficiente por enquanto.",
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
    "category.stores": "Supermercados",
    "category.brands": "Marcas",
    "category.searchBrand": "Buscar marca",
    "category.priceMin": "Mín",
    "category.priceMax": "Máx",
    "category.apply": "Aplicar",
    "category.clear": "Limpar",
    "category.sortBy": "Ordenar por",
    "category.empty": "Nenhum produto com estes filtros.",
    "category.popular": "Produtos populares",
    "category.viewMode": "Modo de exibição",
    "category.viewMode.loadMore": "Carregar mais",
    "category.viewMode.pages": "Páginas",
    "category.loadMore": "Ver mais",
    "category.seen": "Você viu {shown} de {total} produtos",
    "category.goToPage": "Ir para a página:",
    "category.go": "Ir",
    "category.facetMore": "Ver todas ({n})",
    "category.facetLess": "Ver menos",
    "category.upTo": "Até",
    "category.orMore": "ou mais",
    "product.stores": "lojas",
    "sort.price": "Preço",
    "sort.unitPrice": "Preço/unidade",
    "sort.name": "Nome",
    "sort.popular": "Popularidade",
    "list.title": "Sua lista de compras",
    "list.empty": "Sua lista está vazia.",
    "list.total": "Total estimado",
    "list.remove": "Remover",
    "list.keepShopping": "Continuar comprando",
    "list.items": "itens",
    "list.disclaimer": "Preço mais barato ao adicionar; pode variar na loja.",
    "list.view": "Ver lista",
    "nav.login": "Entrar",
    "nav.logout": "Sair",
    "login.title": "Entrar",
    "login.hint": "Use o email da sua conta Cuadra (a mesma do app).",
    "login.submit": "Entrar",
    "alerts.title": "Meus alertas",
    "alerts.notifyMe": "Avise-me quando baixar",
    "alerts.watching": "Seguindo preço",
    "alerts.stopWatching": "Deixar de seguir",
    "alerts.subscriptions": "Produtos que você segue",
    "alerts.notifications": "Notificações",
    "alerts.noAlerts": "Você ainda não segue nenhum produto.",
    "alerts.noNotifications": "Sem notificações por enquanto.",
    "alerts.unsubscribe": "Deixar de seguir",
    "alerts.loginToWatch": "Entre para receber alertas de preço.",
    "alerts.droppedFromTo": "baixou de {from} para {to} em {store}",
    "error.notFoundTitle": "Produto não encontrado",
    "error.notFoundBody": "Não encontramos esse produto. Talvez não esteja mais no catálogo.",
    "error.genericTitle": "Algo deu errado",
    "error.genericBody": "Ocorreu um erro. Tente novamente em um momento.",
    "error.backHome": "← Voltar ao início",
    "common.comingSoon": "Em breve",
    "footer.tagline": "Preços de catálogo online",
    "meta.home.description": "Cuadra — gerencie seu dinheiro e compare preços de supermercado.",
    "admin.nav.section.menu": "Menu",
    "admin.nav.section.users": "Usuários",
    "admin.nav.section.news": "Notícias",
    "admin.nav.section.save": "Save",
    "admin.nav.dashboard": "Painel",
    "admin.nav.dashboard.users": "Usuários",
    "admin.nav.dashboard.news": "Notícias",
    "admin.nav.dashboard.save": "Save",
    "admin.nav.users.support": "Suporte a usuários",
    "admin.nav.users.management": "Gestão de usuários",
    "admin.nav.news.publications": "Publicações",
    "admin.nav.save.supermarket": "Supermercado",
    "admin.nav.save.metrics": "Métricas",
    "admin.nav.save.reviewQueue": "Fila de revisão",
    "admin.nav.save.providers": "Fornecedores",
    "admin.nav.save.sources": "Fontes",
    "admin.nav.save.basket": "Cesta curada",
    "admin.nav.save.financialProducts": "Produtos Financeiros",
    "admin.nav.wip": "🚧 Em construção — ainda não disponível",
    "admin.nav.footer.feedback": "Feedback",
    "admin.nav.footer.help": "Ajuda",
    "admin.category.none": "Sem categoria",
    "admin.method.ean": "EAN",
    "admin.method.trgm": "Similaridade de texto",
    "admin.method.vector": "Vetor",
    "admin.method.hybrid": "Híbrido",
    "admin.method.llm": "IA",
    "admin.method.human": "Humano",
    "admin.topbar.notifications": "Notificações",
    "admin.topbar.settings": "Configurações",
    "admin.toolbar.search.placeholder": "Buscar produto...",
    "admin.toolbar.filters": "Filtros",
    "admin.toolbar.filter.provider": "Fornecedor",
    "admin.toolbar.filter.provider.placeholder": "Buscar fornecedor...",
    "admin.toolbar.filter.provider.all": "Todos os fornecedores",
    "admin.toolbar.filter.method": "Método",
    "admin.toolbar.filter.method.all": "Todos",
    "admin.toolbar.filter.confidenceMin": "Confiança mín.",
    "admin.toolbar.filter.confidenceMax": "Confiança máx.",
    "admin.toolbar.filter.orderBy": "Ordem",
    "admin.toolbar.filter.orderBy.uncertainty": "Incerteza (padrão)",
    "admin.toolbar.filter.orderBy.createdAt": "Mais antigo primeiro",
    "admin.toolbar.filter.confidence": "Confiança (%)",
    "admin.toolbar.filter.confidence.min": "Mínimo",
    "admin.toolbar.filter.confidence.max": "Máximo",
    "admin.toolbar.filters.clear": "Limpar filtros",
    "admin.toolbar.filters.apply": "Aplicar filtros",
    "admin.toolbar.view.list": "Visualização em lista",
    "admin.toolbar.view.grid": "Visualização em grade (em breve)",
    "admin.toolbar.export": "Exportar (em breve)",
    "admin.toolbar.showAll": "Mostrar todos",
    "admin.toolbar.showAll.optionAll": "Mostrar todos",
    "admin.toolbar.showAll.optionUncertain": "Somente incertos",
    "admin.toolbar.actions": "Ações",
    "admin.toolbar.actions.approve": "Aprovar selecionados",
    "admin.toolbar.actions.reject": "Rejeitar selecionados",
    "admin.reviewQueue.title": "Fila de revisão",
    "admin.reviewQueue.info": "Informação",
    "admin.reviewQueue.selectAll": "Selecionar todos",
    "admin.reviewQueue.selectedSuffix": "selecionado(s)",
    "admin.reviewQueue.selectRow": "Selecionar",
    "admin.reviewQueue.empty": "Não há itens na fila com estes filtros.",
    "admin.reviewQueue.noImage": "Sem imagem",
    "admin.reviewQueue.noDescription": "—",
    "admin.reviewQueue.column.info": "Info. Produto",
    "admin.reviewQueue.column.product": "Produto",
    "admin.reviewQueue.column.size": "Tamanho",
    "admin.reviewQueue.column.weightType": "Peso",
    "admin.reviewQueue.column.description": "Descrição",
    "admin.reviewQueue.column.category": "Categoria",
    "admin.reviewQueue.column.brand": "Marca",
    "admin.reviewQueue.column.store": "Loja",
    "admin.reviewQueue.column.method": "Método",
    "admin.reviewQueue.column.matchDate": "Data do match",
    "admin.reviewQueue.column.actions": "Ações",
    "admin.reviewQueue.actions.menuLabel": "Mais ações",
    "admin.reviewQueue.actions.view": "Ver",
    "admin.reviewQueue.actions.edit": "Editar",
    "admin.reviewQueue.actions.share": "Compartilhar",
    "admin.reviewQueue.actions.delete": "Excluir",
    "admin.reviewQueue.actions.comingSoon": "Em breve",
    "admin.reviewQueue.pagination.showing": "Mostrar",
    "admin.reviewQueue.pagination.perPage": "por página",
    "admin.reviewQueue.pagination.of": "de",
    "admin.reviewQueue.bulkResult.summary": "aprovado(s)/rejeitado(s)",
    "admin.reviewQueue.bulkResult.failedSuffix": "falharam",
    "admin.reviewQueue.sync": "Sincronizar",
    "admin.reviewQueue.column.confidence": "Confiança",
    "admin.reviewQueue.column.image": "Imagem",
    "admin.reviewQueue.kpi.demo": "Dados de demonstração — métricas reais em breve",
    "admin.reviewQueue.kpi.menu": "Opções do indicador",
    "admin.reviewQueue.kpi.pending.title": "Fila Pendente",
    "admin.reviewQueue.kpi.pending.subtitle": "Comparado com a semana passada",
    "admin.reviewQueue.kpi.pending.unit": "produtos",
    "admin.reviewQueue.kpi.autoLink.title": "Auto-link Rate",
    "admin.reviewQueue.kpi.autoLink.subtitle": "Produtos vinculados sem humano",
    "admin.reviewQueue.kpi.autoLink.linked": "Auto-vinculados",
    "admin.reviewQueue.kpi.autoLink.pending": "Pendentes",
    "admin.reviewQueue.kpi.methods.title": "Métodos de Match",
    "admin.reviewQueue.kpi.methods.subtitle": "Última semana",
    "admin.reviewQueue.kpi.methods.channels": "Canais ativos",
    "admin.reviewQueue.kpi.queueTime.title": "Tempo na Fila",
    "admin.reviewQueue.kpi.queueTime.subtitle": "Mediana de resolução",
    "admin.reviewQueue.kpi.queueTime.unit": "dias",
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
