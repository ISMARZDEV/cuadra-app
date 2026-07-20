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
  | "admin.nav.save.orchestration"
  | "admin.orchestration.title"
  | "admin.orchestration.subtitle"
  | "admin.orchestration.pending"
  | "admin.orchestration.runnerDown"
  | "admin.orchestration.empty"
  | "admin.orchestration.col.flow"
  | "admin.orchestration.col.provider"
  | "admin.orchestration.col.mode"
  | "admin.orchestration.col.nextRun"
  | "admin.orchestration.col.lastRun"
  | "admin.orchestration.col.outcome"
  | "admin.orchestration.col.actions"
  | "admin.orchestration.outcome.linkedPart"
  | "admin.orchestration.outcome.queuedPart"
  | "admin.orchestration.outcome.newPart"
  | "admin.orchestration.outcome.queuedLinkTitle"
  | "admin.orchestration.mode.manual"
  | "admin.orchestration.mode.automatic_chain"
  | "admin.orchestration.mode.cron"
  | "admin.orchestration.state.never"
  | "admin.orchestration.state.queued"
  | "admin.orchestration.state.running"
  | "admin.orchestration.state.canceling"
  | "admin.orchestration.state.succeeded"
  | "admin.orchestration.state.failed"
  | "admin.orchestration.state.canceled"
  | "admin.orchestration.state.unknown"
  | "admin.orchestration.action.run"
  | "admin.orchestration.action.pause"
  | "admin.orchestration.action.resume"
  | "admin.orchestration.action.cancel"
  | "admin.orchestration.kpi.activeFlows"
  | "admin.orchestration.kpi.activeFlows.hint"
  | "admin.orchestration.kpi.newCanonicals"
  | "admin.orchestration.kpi.newCanonicals.hint"
  | "admin.orchestration.col.status"
  | "admin.orchestration.col.schedule"
  | "admin.orchestration.col.products"
  | "admin.orchestration.products.seen"
  | "admin.orchestration.products.breakdown"
  | "admin.orchestration.schedule.none"
  | "admin.orchestration.action.retry"
  | "admin.orchestration.action.edit"
  | "admin.orchestration.action.delete"
  | "admin.orchestration.actions.menuLabel"
  | "admin.orchestration.confirm.back"
  | "admin.orchestration.confirm.cancel.title"
  | "admin.orchestration.confirm.cancel.body"
  | "admin.orchestration.confirm.cancel.accept"
  | "admin.orchestration.confirm.delete.title"
  | "admin.orchestration.confirm.delete.body"
  | "admin.orchestration.confirm.delete.accept"
  | "admin.orchestration.modal.title"
  | "admin.orchestration.modal.save"
  | "admin.orchestration.modal.saving"
  | "admin.orchestration.modal.reset"
  | "admin.orchestration.modal.fieldMode"
  | "admin.orchestration.modal.fieldCron"
  | "admin.orchestration.modal.fieldTimezone"
  | "admin.orchestration.modal.fieldSla"
  | "admin.orchestration.modal.fieldQueryLimit"
  | "admin.orchestration.modal.hintCron"
  | "admin.orchestration.modal.hintQueryLimit"
  | "admin.orchestration.modal.hintSla"
  | "admin.orchestration.modal.errCronRequired"
  | "admin.orchestration.modal.errSave"
  | "admin.orchestration.modal.envTitle"
  | "admin.orchestration.modal.envBody"
  | "admin.orchestration.create.cta"
  | "admin.orchestration.create.title"
  | "admin.orchestration.create.save"
  | "admin.orchestration.create.saving"
  | "admin.orchestration.create.clear"
  | "admin.orchestration.create.fieldProvider"
  | "admin.orchestration.create.providerSearch"
  | "admin.orchestration.create.providerAll"
  | "admin.orchestration.create.fieldFlow"
  | "admin.orchestration.create.hintFlow"
  | "admin.orchestration.create.errProviderRequired"
  | "admin.orchestration.create.errSave"
  | "admin.orchestration.create.noProviders"
  | "admin.orchestration.search.placeholder"
  | "admin.orchestration.search.aria"
  | "admin.orchestration.filters"
  | "admin.orchestration.filters.title"
  | "admin.orchestration.filters.mode"
  | "admin.orchestration.filters.state"
  | "admin.orchestration.filters.all"
  | "admin.orchestration.filters.clear"
  | "admin.orchestration.filters.apply"
  | "admin.orchestration.emptySearch"
  | "admin.orchestration.pagination.show"
  | "admin.orchestration.pagination.perPage"
  | "admin.orchestration.pagination.of"
  | "admin.orchestration.kpi.withinSla"
  | "admin.orchestration.kpi.withinSla.hint"
  | "admin.orchestration.kpi.autoLinkRate"
  | "admin.orchestration.kpi.autoLinkRate.hint"
  | "admin.orchestration.kpi.badge.allActive"
  | "admin.orchestration.kpi.badge.paused"
  | "admin.orchestration.kpi.badge.onTime"
  | "admin.orchestration.kpi.badge.breached"
  | "admin.orchestration.kpi.badge.queued"
  | "admin.orchestration.kpi.badge.fromQueued"
  | "admin.orchestration.kpi.legend.autoLinked"
  | "admin.orchestration.kpi.legend.queued"
  | "admin.orchestration.kpi.legend.active"
  | "admin.orchestration.kpi.legend.paused"
  | "admin.orchestration.kpi.legend.onTime"
  | "admin.orchestration.kpi.legend.late"
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
  | "admin.topbar.language"
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
  | "admin.reviewQueue.runFilter.label"
  | "admin.reviewQueue.runFilter.clear"
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
  | "admin.reviewQueue.actions.viewInStore"
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
  | "admin.reviewQueue.kpi.queueTime.unit"
  | "admin.basket.title"
  | "admin.basket.info"
  | "admin.basket.search.aria"
  | "admin.basket.search.placeholder"
  | "admin.basket.bulk.actions"
  | "admin.basket.bulk.delete"
  | "admin.basket.bulk.confirmMsg"
  | "admin.basket.bulk.confirm"
  | "admin.basket.add"
  | "admin.basket.cancel"
  | "admin.basket.selectAll"
  | "admin.basket.col.query"
  | "admin.basket.col.category"
  | "admin.basket.col.status"
  | "admin.basket.col.actions"
  | "admin.basket.empty"
  | "admin.basket.emptySearch"
  | "admin.basket.pagination.show"
  | "admin.basket.pagination.perPage"
  | "admin.basket.pagination.of"
  | "admin.basket.row.select"
  | "admin.basket.row.moveUp"
  | "admin.basket.row.moveDown"
  | "admin.basket.row.drag"
  | "admin.basket.row.active"
  | "admin.basket.row.inactive"
  | "admin.basket.row.confirmQ"
  | "admin.basket.row.confirm"
  | "admin.basket.row.confirmDeleteAria"
  | "admin.basket.row.actionsAria"
  | "admin.basket.row.edit"
  | "admin.basket.row.deactivate"
  | "admin.basket.row.activate"
  | "admin.basket.row.delete"
  | "admin.basket.row.errToggle"
  | "admin.basket.row.errDelete"
  | "admin.basket.modal.titleAdd"
  | "admin.basket.modal.titleEdit"
  | "admin.basket.modal.clear"
  | "admin.basket.modal.applyAdd"
  | "admin.basket.modal.applyEdit"
  | "admin.basket.modal.saving"
  | "admin.basket.modal.errRequired"
  | "admin.basket.modal.errSave"
  | "admin.basket.modal.errPreview"
  | "admin.basket.modal.fieldQuery"
  | "admin.basket.modal.fieldCategory"
  | "admin.basket.modal.phQuery"
  | "admin.basket.modal.phCategory"
  | "admin.basket.modal.previewBtn"
  | "admin.basket.modal.previewLoading"
  | "admin.basket.modal.previewNone"
  | "admin.basket.modal.previewError"
  | "admin.basket.modal.resultSing"
  | "admin.basket.modal.resultPlur"
  | "admin.basket.modal.noResults"
  | "admin.basket.modal.viewAria"
  | "admin.providers.title"
  | "admin.providers.subtitle"
  | "admin.providers.new"
  | "admin.providers.field.name"
  | "admin.providers.field.market"
  | "admin.providers.field.type"
  | "admin.providers.field.platform"
  | "admin.providers.field.logo"
  | "admin.providers.create.submit"
  | "admin.providers.create.error"
  | "admin.providers.existing"
  | "admin.providers.empty"
  | "admin.providers.update.nameError"
  | "admin.providers.update.logoError"
  | "admin.providers.row.name"
  | "admin.providers.row.saveName"
  | "admin.providers.row.logo"
  | "admin.providers.row.saveLogo"
  | "admin.sources.title"
  | "admin.sources.subtitle"
  | "admin.sources.search.aria"
  | "admin.sources.search.placeholder"
  | "admin.sources.view.grid"
  | "admin.sources.view.list"
  | "admin.sources.bulk.actions"
  | "admin.sources.bulk.pause"
  | "admin.sources.bulk.resume"
  | "admin.sources.add"
  | "admin.sources.selectAll"
  | "admin.sources.col.health"
  | "admin.sources.col.logo"
  | "admin.sources.col.platform"
  | "admin.sources.col.url"
  | "admin.sources.col.count"
  | "admin.sources.col.lastSeen"
  | "admin.sources.col.actions"
  | "admin.sources.empty"
  | "admin.sources.emptySearch"
  | "admin.sources.pagination.show"
  | "admin.sources.pagination.perPage"
  | "admin.sources.pagination.of"
  | "admin.sources.count.unit"
  | "admin.sources.row.select"
  | "admin.sources.health.ok"
  | "admin.sources.health.stale"
  | "admin.sources.health.paused"
  | "admin.sources.actions.aria"
  | "admin.sources.actions.edit"
  | "admin.sources.actions.pause"
  | "admin.sources.actions.resume"
  | "admin.sources.actions.errPause"
  | "admin.sources.actions.errResume"
  | "admin.sources.modal.titleAdd"
  | "admin.sources.modal.titleEdit"
  | "admin.sources.modal.clear"
  | "admin.sources.modal.saving"
  | "admin.sources.modal.saveEdit"
  | "admin.sources.modal.saveAdd"
  | "admin.sources.modal.errProviderRequired"
  | "admin.sources.modal.errUrlRequired"
  | "admin.sources.modal.errJsonInvalid"
  | "admin.sources.modal.errSaveEdit"
  | "admin.sources.modal.errSaveAdd"
  | "admin.sources.modal.fieldProvider"
  | "admin.sources.modal.providerSearch"
  | "admin.sources.modal.providerAll"
  | "admin.sources.modal.fieldPlatform"
  | "admin.sources.modal.fieldUrl"
  | "admin.sources.modal.fieldAuth"
  | "admin.sources.modal.fieldTokenBearer"
  | "admin.sources.modal.phTokenBearer"
  | "admin.sources.modal.fieldLocation"
  | "admin.sources.modal.locationHeader"
  | "admin.sources.modal.locationQuery"
  | "admin.sources.modal.fieldHeaderName"
  | "admin.sources.modal.fieldKeyValue"
  | "admin.sources.modal.phKeyValue"
  | "admin.sources.modal.fieldUser"
  | "admin.sources.modal.fieldPass"
  | "admin.sources.modal.advanced"
  | "admin.sources.modal.fieldHeaders"
  | "admin.sources.modal.fieldEndpoints"
  | "admin.sources.modal.authNone"
  | "admin.sources.modal.authBearer"
  | "admin.sources.modal.authApiKey"
  | "admin.sources.modal.authBasic"
  | "admin.sources.modal.probeTitle"
  | "admin.sources.modal.probePh"
  | "admin.sources.modal.probeAria"
  | "admin.sources.modal.probeLoading"
  | "admin.sources.modal.probeBtn"
  | "admin.sources.modal.probeErrConfig"
  | "admin.sources.modal.probeErrUpstream"
  | "admin.sources.modal.probeNoResults";

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
    "admin.nav.save.orchestration": "Orquestación",
    "admin.orchestration.title": "Orquestación (Save)",
    "admin.orchestration.subtitle": "Opera el descubrimiento y el matcheo por código de barras sin salir del admin.",
    "admin.orchestration.pending":
      "Módulo en construcción. El acceso ya está habilitado; las corridas, la programación y los indicadores llegan en las próximas entregas.",
    "admin.orchestration.runnerDown": "El orquestador no responde. La configuración se puede ver y editar; las métricas de corrida no están disponibles.",
    "admin.orchestration.empty": "Todavía no hay flujos configurados. Creá uno para empezar a operar el descubrimiento.",
    "admin.orchestration.col.flow": "Flujo",
    "admin.orchestration.col.provider": "Proveedor",
    "admin.orchestration.col.mode": "Modo",
    "admin.orchestration.col.nextRun": "Próxima corrida",
    "admin.orchestration.col.lastRun": "Última corrida",
    "admin.orchestration.col.outcome": "Resultado",
    "admin.orchestration.col.actions": "Acciones",
    "admin.orchestration.outcome.linkedPart": "{autoLinked} enlazados",
    "admin.orchestration.outcome.queuedPart": "{queued} a la cola",
    "admin.orchestration.outcome.newPart": "{canonicals} nuevos",
    "admin.orchestration.outcome.queuedLinkTitle": "Ver en la cola de revisión lo que dejó esta corrida",
    "admin.orchestration.mode.manual": "Manual",
    "admin.orchestration.mode.automatic_chain": "Automático (por dependencia)",
    "admin.orchestration.mode.cron": "Programado",
    "admin.orchestration.state.never": "Sin corridas",
    "admin.orchestration.state.queued": "En cola",
    "admin.orchestration.state.running": "Corriendo",
    "admin.orchestration.state.canceling": "Cancelando",
    "admin.orchestration.state.succeeded": "Exitosa",
    "admin.orchestration.state.failed": "Fallida",
    "admin.orchestration.state.canceled": "Cancelada",
    "admin.orchestration.state.unknown": "Desconocido",
    "admin.orchestration.action.run": "Ejecutar ahora",
    "admin.orchestration.action.pause": "Pausar",
    "admin.orchestration.action.resume": "Activar",
    "admin.orchestration.action.cancel": "Cancelar corrida",
    "admin.orchestration.kpi.activeFlows": "Flujos activos",
    "admin.orchestration.kpi.activeFlows.hint": "Activos sobre el total configurado",
    "admin.orchestration.kpi.newCanonicals": "Canónicos nuevos",
    "admin.orchestration.kpi.newCanonicals.hint": "Nacieron de lo que estas corridas descubrieron",
    "admin.orchestration.col.status": "Estado",
    "admin.orchestration.col.schedule": "Horario",
    "admin.orchestration.col.products": "Productos",
    "admin.orchestration.products.seen": "{seen} vistos",
    "admin.orchestration.products.breakdown": "{refreshed} actualizados · {matched} matcheados · {discarded} descartados",
    "admin.orchestration.schedule.none": "Sin programar",
    "admin.orchestration.action.retry": "Reintentar",
    "admin.orchestration.action.edit": "Editar política",
    "admin.orchestration.action.delete": "Eliminar flujo",
    "admin.orchestration.actions.menuLabel": "Acciones del flujo",
    "admin.orchestration.confirm.back": "Volver",
    "admin.orchestration.confirm.cancel.title": "¿Cancelar la corrida en curso?",
    "admin.orchestration.confirm.cancel.body":
      "La corrida se detiene donde esté. Los precios ya ingeridos se conservan y lo que quede sin procesar entrará en la próxima corrida.",
    "admin.orchestration.confirm.cancel.accept": "Sí, cancelar la corrida",
    "admin.orchestration.confirm.delete.title": "¿Eliminar este flujo?",
    "admin.orchestration.confirm.delete.body":
      "El flujo deja de aparecer en la consola y no volverá a ejecutarse. El histórico de sus corridas se conserva intacto: es un retiro reversible, no un borrado.",
    "admin.orchestration.confirm.delete.accept": "Sí, eliminar el flujo",
    "admin.orchestration.modal.title": "Editar política",
    "admin.orchestration.modal.save": "Guardar política",
    "admin.orchestration.modal.saving": "Guardando…",
    "admin.orchestration.modal.reset": "Restablecer",
    "admin.orchestration.modal.fieldMode": "Modo de ejecución",
    "admin.orchestration.modal.fieldCron": "Expresión cron",
    "admin.orchestration.modal.fieldTimezone": "Zona horaria",
    "admin.orchestration.modal.fieldSla": "SLA (minutos)",
    "admin.orchestration.modal.fieldQueryLimit": "Límite de queries",
    "admin.orchestration.modal.hintCron":
      "Cinco campos (minuto hora día mes día-semana). Se evalúa en la zona horaria de abajo, no en la del servidor.",
    "admin.orchestration.modal.hintQueryLimit": "Vacío = usa el límite global del mercado. Un 0 sería un límite de cero queries.",
    "admin.orchestration.modal.hintSla": "Minutos tolerados desde la última corrida EXITOSA. Solo aplica a flujos programados.",
    "admin.orchestration.modal.errCronRequired": "Un flujo programado necesita su expresión cron.",
    "admin.orchestration.modal.errSave": "No se pudo guardar la política. Revisá los valores e intentá de nuevo.",
    "admin.orchestration.modal.envTitle": "Qué NO se configura desde acá",
    "admin.orchestration.modal.envBody": "Estas piezas siguen viviendo en variables de entorno del servidor y no se pueden cambiar desde el admin: el límite global de queries (SAVE_REFRESH_QUERY_LIMIT), y los switches de la cascada de matcheo, del clasificador y del juez LLM. Si necesitás tocar alguna, hace falta un cambio de configuración en el despliegue.",
    "admin.orchestration.create.cta": "Nuevo flujo",
    "admin.orchestration.create.title": "Nuevo flujo de proveedor",
    "admin.orchestration.create.save": "Crear flujo",
    "admin.orchestration.create.saving": "Creando…",
    "admin.orchestration.create.clear": "Limpiar",
    "admin.orchestration.create.fieldProvider": "Proveedor",
    "admin.orchestration.create.providerSearch": "Buscar proveedor…",
    "admin.orchestration.create.providerAll": "Todos",
    "admin.orchestration.create.fieldFlow": "Flujo",
    "admin.orchestration.create.hintFlow":
      "El flujo nace en modo manual: no dispara nada hasta que le definas un horario desde «Editar política».",
    "admin.orchestration.create.errProviderRequired": "Elegí un proveedor para el flujo.",
    "admin.orchestration.create.errSave": "No se pudo crear el flujo.",
    "admin.orchestration.create.noProviders":
      "Todos los proveedores del mercado ya tienen su flujo configurado. Para reutilizar uno, editá el existente.",
    "admin.orchestration.search.placeholder": "Buscar proveedor o flujo…",
    "admin.orchestration.search.aria": "Buscar flujos de orquestación",
    "admin.orchestration.filters": "Filtros",
    "admin.orchestration.filters.title": "Filtrar flujos",
    "admin.orchestration.filters.mode": "Modo de ejecución",
    "admin.orchestration.filters.state": "Estado de la última corrida",
    "admin.orchestration.filters.all": "Todos",
    "admin.orchestration.filters.clear": "Restablecer",
    "admin.orchestration.filters.apply": "Aplicar filtros",
    "admin.orchestration.emptySearch": "Ningún flujo coincide con la búsqueda o los filtros aplicados.",
    "admin.orchestration.pagination.show": "Mostrar",
    "admin.orchestration.pagination.perPage": "por página",
    "admin.orchestration.pagination.of": "{from}–{to} de {total}",
    "admin.orchestration.kpi.withinSla": "Dentro del SLA",
    "admin.orchestration.kpi.withinSla.hint": "Corrieron a tiempo. Los manuales no cuentan.",
    "admin.orchestration.kpi.autoLinkRate": "Tasa de auto-enlace",
    "admin.orchestration.kpi.autoLinkRate.hint": "Resueltos sin humano en la última corrida",
    "admin.orchestration.kpi.badge.allActive": "Todos activos",
    "admin.orchestration.kpi.badge.paused": "{count} en pausa",
    "admin.orchestration.kpi.badge.onTime": "Todos a tiempo",
    "admin.orchestration.kpi.badge.breached": "{count} fuera",
    "admin.orchestration.kpi.badge.queued": "{count} a la cola",
    "admin.orchestration.kpi.badge.fromQueued": "de {count} en cola",
    "admin.orchestration.kpi.legend.autoLinked": "Auto-enlazados",
    "admin.orchestration.kpi.legend.queued": "A la cola",
    "admin.orchestration.kpi.legend.active": "Activos",
    "admin.orchestration.kpi.legend.paused": "En pausa",
    "admin.orchestration.kpi.legend.onTime": "A tiempo",
    "admin.orchestration.kpi.legend.late": "Fuera",
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
    "admin.topbar.language": "Idioma",
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
    "admin.reviewQueue.runFilter.label": "Filtrando por corrida",
    "admin.reviewQueue.runFilter.clear": "Quitar filtro",
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
    "admin.reviewQueue.actions.viewInStore": "Ver en la tienda",
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
    "admin.basket.title": "Canasta curada",
    "admin.basket.info": "Términos que la ingesta usa para armar la canasta (mercado {market}).",
    "admin.basket.search.aria": "Buscar en la canasta",
    "admin.basket.search.placeholder": "Buscar query o categoría…",
    "admin.basket.bulk.actions": "Acciones",
    "admin.basket.bulk.delete": "Eliminar",
    "admin.basket.bulk.confirmMsg": "¿Eliminar {n} queries de la canasta?",
    "admin.basket.bulk.confirm": "Confirmar eliminar",
    "admin.basket.add": "Agregar query",
    "admin.basket.cancel": "Cancelar",
    "admin.basket.selectAll": "Seleccionar todas",
    "admin.basket.col.query": "Query",
    "admin.basket.col.category": "Categoría",
    "admin.basket.col.status": "Estado",
    "admin.basket.col.actions": "Acciones",
    "admin.basket.empty": "Sin queries todavía.",
    "admin.basket.emptySearch": "Sin resultados para esa búsqueda.",
    "admin.basket.pagination.show": "Mostrar",
    "admin.basket.pagination.perPage": "por página",
    "admin.basket.pagination.of": "de",
    "admin.basket.row.select": "Seleccionar",
    "admin.basket.row.moveUp": "Subir",
    "admin.basket.row.moveDown": "Bajar",
    "admin.basket.row.drag": "Arrastrar",
    "admin.basket.row.active": "Activa",
    "admin.basket.row.inactive": "Inactiva",
    "admin.basket.row.confirmQ": "¿Eliminar?",
    "admin.basket.row.confirm": "Confirmar",
    "admin.basket.row.confirmDeleteAria": "Confirmar eliminar",
    "admin.basket.row.actionsAria": "Acciones",
    "admin.basket.row.edit": "Editar",
    "admin.basket.row.deactivate": "Desactivar",
    "admin.basket.row.activate": "Activar",
    "admin.basket.row.delete": "Eliminar",
    "admin.basket.row.errToggle": "No se pudo cambiar el estado.",
    "admin.basket.row.errDelete": "No se pudo eliminar la query.",
    "admin.basket.modal.titleAdd": "Agregar query",
    "admin.basket.modal.titleEdit": "Editar query",
    "admin.basket.modal.clear": "Limpiar",
    "admin.basket.modal.applyAdd": "Crear query",
    "admin.basket.modal.applyEdit": "Guardar cambios",
    "admin.basket.modal.saving": "Guardando…",
    "admin.basket.modal.errRequired": "La query es obligatoria.",
    "admin.basket.modal.errSave": "No se pudo guardar los cambios.",
    "admin.basket.modal.errPreview": "Escribí una query para previsualizar.",
    "admin.basket.modal.fieldQuery": "Query",
    "admin.basket.modal.fieldCategory": "Categoría",
    "admin.basket.modal.phQuery": "ej. arroz la garza",
    "admin.basket.modal.phCategory": "ej. Granos y legumbres",
    "admin.basket.modal.previewBtn": "Previsualizar en tiendas",
    "admin.basket.modal.previewLoading": "Buscando…",
    "admin.basket.modal.previewNone": "Ninguna tienda devolvió resultados para ese término.",
    "admin.basket.modal.previewError": "error",
    "admin.basket.modal.resultSing": "resultado",
    "admin.basket.modal.resultPlur": "resultados",
    "admin.basket.modal.noResults": "Sin resultados.",
    "admin.basket.modal.viewAria": "Ver",
    "admin.providers.title": "Proveedores (Save)",
    "admin.providers.subtitle": "Alta y logo por URL pegada (MVP, sin subida de archivos).",
    "admin.providers.new": "Nuevo proveedor",
    "admin.providers.field.name": "Nombre",
    "admin.providers.field.market": "Mercado",
    "admin.providers.field.type": "Tipo",
    "admin.providers.field.platform": "Plataforma",
    "admin.providers.field.logo": "Logo (URL, opcional)",
    "admin.providers.create.submit": "Crear proveedor",
    "admin.providers.create.error": "No se pudo crear el proveedor.",
    "admin.providers.existing": "Existentes",
    "admin.providers.empty": "Sin proveedores todavía.",
    "admin.providers.update.nameError": "No se pudo actualizar el nombre.",
    "admin.providers.update.logoError": "No se pudo guardar el logo.",
    "admin.providers.row.name": "Nombre de {name}",
    "admin.providers.row.saveName": "Guardar nombre de {name}",
    "admin.providers.row.logo": "Logo de {name}",
    "admin.providers.row.saveLogo": "Guardar logo de {name}",
    "admin.sources.title": "Fuentes (Save)",
    "admin.sources.subtitle":
      "Configuración de extracción por proveedor. La auth (Bearer / API key) vive cifrada en la fuente y se muestra enmascarada. «Probar» es una vista previa — no guarda nada.",
    "admin.sources.search.aria": "Buscar fuentes",
    "admin.sources.search.placeholder": "Buscar por plataforma o URL…",
    "admin.sources.view.grid": "Ver en cards",
    "admin.sources.view.list": "Ver en lista",
    "admin.sources.bulk.actions": "Acciones",
    "admin.sources.bulk.pause": "Pausar seleccionadas ({count})",
    "admin.sources.bulk.resume": "Reanudar seleccionadas ({count})",
    "admin.sources.add": "Agregar proveedor",
    "admin.sources.selectAll": "Seleccionar todo",
    "admin.sources.col.health": "Salud",
    "admin.sources.col.logo": "Logo",
    "admin.sources.col.platform": "Plataforma",
    "admin.sources.col.url": "Base URL",
    "admin.sources.col.count": "Productos",
    "admin.sources.col.lastSeen": "Última actualización",
    "admin.sources.col.actions": "Acciones",
    "admin.sources.empty": "Sin fuentes todavía.",
    "admin.sources.emptySearch": "Sin resultados para esa búsqueda.",
    "admin.sources.pagination.show": "Mostrar",
    "admin.sources.pagination.perPage": "por página",
    "admin.sources.pagination.of": "{from}–{to} de {total}",
    "admin.sources.count.unit": "productos",
    "admin.sources.row.select": "Seleccionar {name}",
    "admin.sources.health.ok": "OK",
    "admin.sources.health.stale": "Desactualizada",
    "admin.sources.health.paused": "Pausada",
    "admin.sources.actions.aria": "Acciones de {name}",
    "admin.sources.actions.edit": "Editar",
    "admin.sources.actions.pause": "Pausar",
    "admin.sources.actions.resume": "Reanudar",
    "admin.sources.actions.errPause": "No se pudo pausar.",
    "admin.sources.actions.errResume": "No se pudo reanudar.",
    "admin.sources.modal.titleAdd": "Agregar proveedor",
    "admin.sources.modal.titleEdit": "Editar fuente",
    "admin.sources.modal.clear": "Limpiar",
    "admin.sources.modal.saving": "Guardando…",
    "admin.sources.modal.saveEdit": "Guardar cambios",
    "admin.sources.modal.saveAdd": "Crear fuente",
    "admin.sources.modal.errProviderRequired": "El id del proveedor es obligatorio.",
    "admin.sources.modal.errUrlRequired": "La Base URL es obligatoria.",
    "admin.sources.modal.errJsonInvalid": "JSON inválido en {label}",
    "admin.sources.modal.errSaveEdit": "No se pudo guardar la fuente.",
    "admin.sources.modal.errSaveAdd": "No se pudo crear la fuente.",
    "admin.sources.modal.fieldProvider": "Proveedor",
    "admin.sources.modal.providerSearch": "Buscar proveedor…",
    "admin.sources.modal.providerAll": "Selecciona un proveedor…",
    "admin.sources.modal.fieldPlatform": "Plataforma",
    "admin.sources.modal.fieldUrl": "Base URL",
    "admin.sources.modal.fieldAuth": "Autenticación",
    "admin.sources.modal.fieldTokenBearer": "Token (Bearer)",
    "admin.sources.modal.phTokenBearer": "Authorization: Bearer …",
    "admin.sources.modal.fieldLocation": "Ubicación",
    "admin.sources.modal.locationHeader": "Header",
    "admin.sources.modal.locationQuery": "Query",
    "admin.sources.modal.fieldHeaderName": "Nombre del header",
    "admin.sources.modal.fieldKeyValue": "Token / valor (el secreto)",
    "admin.sources.modal.phKeyValue": "pega aquí el token de la API",
    "admin.sources.modal.fieldUser": "Usuario",
    "admin.sources.modal.fieldPass": "Contraseña",
    "admin.sources.modal.advanced": "Avanzado (Headers / Endpoints)",
    "admin.sources.modal.fieldHeaders": "Headers (JSON)",
    "admin.sources.modal.fieldEndpoints": "Endpoints (JSON)",
    "admin.sources.modal.authNone": "Ninguna",
    "admin.sources.modal.authBearer": "Bearer token",
    "admin.sources.modal.authApiKey": "API key",
    "admin.sources.modal.authBasic": "Usuario y contraseña",
    "admin.sources.modal.probeTitle": "Probar (vista previa) — no guarda nada.",
    "admin.sources.modal.probePh": "Query de búsqueda…",
    "admin.sources.modal.probeAria": "Query de prueba",
    "admin.sources.modal.probeLoading": "Probando…",
    "admin.sources.modal.probeBtn": "Probar",
    "admin.sources.modal.probeErrConfig": "Configuración inválida: {message}",
    "admin.sources.modal.probeErrUpstream": "La tienda no respondió: {message}",
    "admin.sources.modal.probeNoResults": "Sin resultados para esa query.",
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
    "admin.nav.save.orchestration": "Orchestration",
    "admin.orchestration.title": "Orchestration (Save)",
    "admin.orchestration.subtitle": "Operate discovery and barcode matching without leaving the admin.",
    "admin.orchestration.pending":
      "Module under construction. Access is enabled; runs, scheduling and indicators arrive in upcoming deliveries.",
    "admin.orchestration.runnerDown": "The orchestrator is not responding. Configuration can be viewed and edited; run metrics are unavailable.",
    "admin.orchestration.empty": "No flows configured yet. Create one to start operating discovery.",
    "admin.orchestration.col.flow": "Flow",
    "admin.orchestration.col.provider": "Provider",
    "admin.orchestration.col.mode": "Mode",
    "admin.orchestration.col.nextRun": "Next run",
    "admin.orchestration.col.lastRun": "Last run",
    "admin.orchestration.col.outcome": "Outcome",
    "admin.orchestration.col.actions": "Actions",
    "admin.orchestration.outcome.linkedPart": "{autoLinked} linked",
    "admin.orchestration.outcome.queuedPart": "{queued} queued",
    "admin.orchestration.outcome.newPart": "{canonicals} new",
    "admin.orchestration.outcome.queuedLinkTitle": "See what this run left in the review queue",
    "admin.orchestration.mode.manual": "Manual",
    "admin.orchestration.mode.automatic_chain": "Automatic (by dependency)",
    "admin.orchestration.mode.cron": "Scheduled",
    "admin.orchestration.state.never": "Never ran",
    "admin.orchestration.state.queued": "Queued",
    "admin.orchestration.state.running": "Running",
    "admin.orchestration.state.canceling": "Canceling",
    "admin.orchestration.state.succeeded": "Succeeded",
    "admin.orchestration.state.failed": "Failed",
    "admin.orchestration.state.canceled": "Canceled",
    "admin.orchestration.state.unknown": "Unknown",
    "admin.orchestration.action.run": "Run now",
    "admin.orchestration.action.pause": "Pause",
    "admin.orchestration.action.resume": "Resume",
    "admin.orchestration.action.cancel": "Cancel run",
    "admin.orchestration.kpi.activeFlows": "Active flows",
    "admin.orchestration.kpi.activeFlows.hint": "Active out of total configured",
    "admin.orchestration.kpi.newCanonicals": "New canonicals",
    "admin.orchestration.kpi.newCanonicals.hint": "Born from what these runs discovered",
    "admin.orchestration.col.status": "Status",
    "admin.orchestration.col.schedule": "Schedule",
    "admin.orchestration.col.products": "Products",
    "admin.orchestration.products.seen": "{seen} seen",
    "admin.orchestration.products.breakdown": "{refreshed} refreshed · {matched} matched · {discarded} discarded",
    "admin.orchestration.schedule.none": "Not scheduled",
    "admin.orchestration.action.retry": "Retry",
    "admin.orchestration.action.edit": "Edit policy",
    "admin.orchestration.action.delete": "Delete flow",
    "admin.orchestration.actions.menuLabel": "Flow actions",
    "admin.orchestration.confirm.back": "Go back",
    "admin.orchestration.confirm.cancel.title": "Cancel the run in progress?",
    "admin.orchestration.confirm.cancel.body":
      "The run stops wherever it is. Prices already ingested are kept, and whatever is left unprocessed will be picked up by the next run.",
    "admin.orchestration.confirm.cancel.accept": "Yes, cancel the run",
    "admin.orchestration.confirm.delete.title": "Delete this flow?",
    "admin.orchestration.confirm.delete.body":
      "The flow disappears from the console and will not run again. Its run history is kept intact: this is a reversible retirement, not a deletion.",
    "admin.orchestration.confirm.delete.accept": "Yes, delete the flow",
    "admin.orchestration.modal.title": "Edit policy",
    "admin.orchestration.modal.save": "Save policy",
    "admin.orchestration.modal.saving": "Saving…",
    "admin.orchestration.modal.reset": "Reset",
    "admin.orchestration.modal.fieldMode": "Execution mode",
    "admin.orchestration.modal.fieldCron": "Cron expression",
    "admin.orchestration.modal.fieldTimezone": "Time zone",
    "admin.orchestration.modal.fieldSla": "SLA (minutes)",
    "admin.orchestration.modal.fieldQueryLimit": "Query limit",
    "admin.orchestration.modal.hintCron":
      "Five fields (minute hour day month weekday). Evaluated in the time zone below, not the server's.",
    "admin.orchestration.modal.hintQueryLimit": "Empty = use the market-wide limit. A 0 would mean a limit of zero queries.",
    "admin.orchestration.modal.hintSla": "Minutes tolerated since the last SUCCESSFUL run. Only applies to scheduled flows.",
    "admin.orchestration.modal.errCronRequired": "A scheduled flow needs its cron expression.",
    "admin.orchestration.modal.errSave": "Could not save the policy. Check the values and try again.",
    "admin.orchestration.modal.envTitle": "What is NOT configured here",
    "admin.orchestration.modal.envBody": "These still live in server environment variables and cannot be changed from the admin: the market-wide query limit (SAVE_REFRESH_QUERY_LIMIT), and the switches for the matching cascade, the classifier and the LLM judge. Changing any of them requires a deployment config change.",
    "admin.orchestration.create.cta": "New flow",
    "admin.orchestration.create.title": "New provider flow",
    "admin.orchestration.create.save": "Create flow",
    "admin.orchestration.create.saving": "Creating…",
    "admin.orchestration.create.clear": "Clear",
    "admin.orchestration.create.fieldProvider": "Provider",
    "admin.orchestration.create.providerSearch": "Search provider…",
    "admin.orchestration.create.providerAll": "All",
    "admin.orchestration.create.fieldFlow": "Flow",
    "admin.orchestration.create.hintFlow":
      "The flow starts in manual mode: it fires nothing until you give it a schedule from “Edit policy”.",
    "admin.orchestration.create.errProviderRequired": "Pick a provider for the flow.",
    "admin.orchestration.create.errSave": "Could not create the flow.",
    "admin.orchestration.create.noProviders":
      "Every provider in this market already has its flow configured. To reuse one, edit the existing flow.",
    "admin.orchestration.search.placeholder": "Search provider or flow…",
    "admin.orchestration.search.aria": "Search orchestration flows",
    "admin.orchestration.filters": "Filters",
    "admin.orchestration.filters.title": "Filter flows",
    "admin.orchestration.filters.mode": "Execution mode",
    "admin.orchestration.filters.state": "Last run state",
    "admin.orchestration.filters.all": "All",
    "admin.orchestration.filters.clear": "Reset",
    "admin.orchestration.filters.apply": "Apply filters",
    "admin.orchestration.emptySearch": "No flow matches the current search or filters.",
    "admin.orchestration.pagination.show": "Show",
    "admin.orchestration.pagination.perPage": "per page",
    "admin.orchestration.pagination.of": "{from}–{to} of {total}",
    "admin.orchestration.kpi.withinSla": "Within SLA",
    "admin.orchestration.kpi.withinSla.hint": "Ran on time. Manual flows are excluded.",
    "admin.orchestration.kpi.autoLinkRate": "Auto-link rate",
    "admin.orchestration.kpi.autoLinkRate.hint": "Resolved without a human in the last run",
    "admin.orchestration.kpi.badge.allActive": "All active",
    "admin.orchestration.kpi.badge.paused": "{count} paused",
    "admin.orchestration.kpi.badge.onTime": "All on time",
    "admin.orchestration.kpi.badge.breached": "{count} late",
    "admin.orchestration.kpi.badge.queued": "{count} queued",
    "admin.orchestration.kpi.badge.fromQueued": "from {count} queued",
    "admin.orchestration.kpi.legend.autoLinked": "Auto-linked",
    "admin.orchestration.kpi.legend.queued": "Queued",
    "admin.orchestration.kpi.legend.active": "Active",
    "admin.orchestration.kpi.legend.paused": "Paused",
    "admin.orchestration.kpi.legend.onTime": "On time",
    "admin.orchestration.kpi.legend.late": "Late",
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
    "admin.topbar.language": "Language",
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
    "admin.reviewQueue.runFilter.label": "Filtering by run",
    "admin.reviewQueue.runFilter.clear": "Clear filter",
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
    "admin.reviewQueue.actions.viewInStore": "View in store",
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
    "admin.basket.title": "Curated basket",
    "admin.basket.info": "Search terms the ingestion uses to build the basket (market {market}).",
    "admin.basket.search.aria": "Search the basket",
    "admin.basket.search.placeholder": "Search query or category…",
    "admin.basket.bulk.actions": "Actions",
    "admin.basket.bulk.delete": "Delete",
    "admin.basket.bulk.confirmMsg": "Delete {n} queries from the basket?",
    "admin.basket.bulk.confirm": "Confirm delete",
    "admin.basket.add": "Add query",
    "admin.basket.cancel": "Cancel",
    "admin.basket.selectAll": "Select all",
    "admin.basket.col.query": "Query",
    "admin.basket.col.category": "Category",
    "admin.basket.col.status": "Status",
    "admin.basket.col.actions": "Actions",
    "admin.basket.empty": "No queries yet.",
    "admin.basket.emptySearch": "No results for that search.",
    "admin.basket.pagination.show": "Show",
    "admin.basket.pagination.perPage": "per page",
    "admin.basket.pagination.of": "of",
    "admin.basket.row.select": "Select",
    "admin.basket.row.moveUp": "Move up",
    "admin.basket.row.moveDown": "Move down",
    "admin.basket.row.drag": "Drag",
    "admin.basket.row.active": "Active",
    "admin.basket.row.inactive": "Inactive",
    "admin.basket.row.confirmQ": "Delete?",
    "admin.basket.row.confirm": "Confirm",
    "admin.basket.row.confirmDeleteAria": "Confirm delete",
    "admin.basket.row.actionsAria": "Actions",
    "admin.basket.row.edit": "Edit",
    "admin.basket.row.deactivate": "Deactivate",
    "admin.basket.row.activate": "Activate",
    "admin.basket.row.delete": "Delete",
    "admin.basket.row.errToggle": "Could not change the status.",
    "admin.basket.row.errDelete": "Could not delete the query.",
    "admin.basket.modal.titleAdd": "Add query",
    "admin.basket.modal.titleEdit": "Edit query",
    "admin.basket.modal.clear": "Clear",
    "admin.basket.modal.applyAdd": "Create query",
    "admin.basket.modal.applyEdit": "Save changes",
    "admin.basket.modal.saving": "Saving…",
    "admin.basket.modal.errRequired": "The query is required.",
    "admin.basket.modal.errSave": "Could not save the changes.",
    "admin.basket.modal.errPreview": "Type a query to preview.",
    "admin.basket.modal.fieldQuery": "Query",
    "admin.basket.modal.fieldCategory": "Category",
    "admin.basket.modal.phQuery": "e.g. arroz la garza",
    "admin.basket.modal.phCategory": "e.g. Grains & legumes",
    "admin.basket.modal.previewBtn": "Preview across stores",
    "admin.basket.modal.previewLoading": "Searching…",
    "admin.basket.modal.previewNone": "No store returned results for that term.",
    "admin.basket.modal.previewError": "error",
    "admin.basket.modal.resultSing": "result",
    "admin.basket.modal.resultPlur": "results",
    "admin.basket.modal.noResults": "No results.",
    "admin.basket.modal.viewAria": "View",
    "admin.providers.title": "Providers (Save)",
    "admin.providers.subtitle": "Create providers and set a logo by pasted URL (MVP, no file upload).",
    "admin.providers.new": "New provider",
    "admin.providers.field.name": "Name",
    "admin.providers.field.market": "Market",
    "admin.providers.field.type": "Type",
    "admin.providers.field.platform": "Platform",
    "admin.providers.field.logo": "Logo (URL, optional)",
    "admin.providers.create.submit": "Create provider",
    "admin.providers.create.error": "Could not create the provider.",
    "admin.providers.existing": "Existing",
    "admin.providers.empty": "No providers yet.",
    "admin.providers.update.nameError": "Could not update the name.",
    "admin.providers.update.logoError": "Could not save the logo.",
    "admin.providers.row.name": "Name of {name}",
    "admin.providers.row.saveName": "Save name of {name}",
    "admin.providers.row.logo": "Logo of {name}",
    "admin.providers.row.saveLogo": "Save logo of {name}",
    "admin.sources.title": "Sources (Save)",
    "admin.sources.subtitle":
      "Extraction config per provider. Auth (Bearer / API key) is stored encrypted in the source and shown masked. “Test” is a preview — it saves nothing.",
    "admin.sources.search.aria": "Search sources",
    "admin.sources.search.placeholder": "Search by platform or URL…",
    "admin.sources.view.grid": "Card view",
    "admin.sources.view.list": "List view",
    "admin.sources.bulk.actions": "Actions",
    "admin.sources.bulk.pause": "Pause selected ({count})",
    "admin.sources.bulk.resume": "Resume selected ({count})",
    "admin.sources.add": "Add provider",
    "admin.sources.selectAll": "Select all",
    "admin.sources.col.health": "Health",
    "admin.sources.col.logo": "Logo",
    "admin.sources.col.platform": "Platform",
    "admin.sources.col.url": "Base URL",
    "admin.sources.col.count": "Products",
    "admin.sources.col.lastSeen": "Last updated",
    "admin.sources.col.actions": "Actions",
    "admin.sources.empty": "No sources yet.",
    "admin.sources.emptySearch": "No results for that search.",
    "admin.sources.pagination.show": "Show",
    "admin.sources.pagination.perPage": "per page",
    "admin.sources.pagination.of": "{from}–{to} of {total}",
    "admin.sources.count.unit": "products",
    "admin.sources.row.select": "Select {name}",
    "admin.sources.health.ok": "OK",
    "admin.sources.health.stale": "Stale",
    "admin.sources.health.paused": "Paused",
    "admin.sources.actions.aria": "Actions for {name}",
    "admin.sources.actions.edit": "Edit",
    "admin.sources.actions.pause": "Pause",
    "admin.sources.actions.resume": "Resume",
    "admin.sources.actions.errPause": "Could not pause.",
    "admin.sources.actions.errResume": "Could not resume.",
    "admin.sources.modal.titleAdd": "Add provider",
    "admin.sources.modal.titleEdit": "Edit source",
    "admin.sources.modal.clear": "Clear",
    "admin.sources.modal.saving": "Saving…",
    "admin.sources.modal.saveEdit": "Save changes",
    "admin.sources.modal.saveAdd": "Create source",
    "admin.sources.modal.errProviderRequired": "The provider id is required.",
    "admin.sources.modal.errUrlRequired": "The Base URL is required.",
    "admin.sources.modal.errJsonInvalid": "Invalid JSON in {label}",
    "admin.sources.modal.errSaveEdit": "Could not save the source.",
    "admin.sources.modal.errSaveAdd": "Could not create the source.",
    "admin.sources.modal.fieldProvider": "Provider",
    "admin.sources.modal.providerSearch": "Search provider…",
    "admin.sources.modal.providerAll": "Select a provider…",
    "admin.sources.modal.fieldPlatform": "Platform",
    "admin.sources.modal.fieldUrl": "Base URL",
    "admin.sources.modal.fieldAuth": "Authentication",
    "admin.sources.modal.fieldTokenBearer": "Token (Bearer)",
    "admin.sources.modal.phTokenBearer": "Authorization: Bearer …",
    "admin.sources.modal.fieldLocation": "Location",
    "admin.sources.modal.locationHeader": "Header",
    "admin.sources.modal.locationQuery": "Query",
    "admin.sources.modal.fieldHeaderName": "Header name",
    "admin.sources.modal.fieldKeyValue": "Token / value (the secret)",
    "admin.sources.modal.phKeyValue": "paste the API token here",
    "admin.sources.modal.fieldUser": "Username",
    "admin.sources.modal.fieldPass": "Password",
    "admin.sources.modal.advanced": "Advanced (Headers / Endpoints)",
    "admin.sources.modal.fieldHeaders": "Headers (JSON)",
    "admin.sources.modal.fieldEndpoints": "Endpoints (JSON)",
    "admin.sources.modal.authNone": "None",
    "admin.sources.modal.authBearer": "Bearer token",
    "admin.sources.modal.authApiKey": "API key",
    "admin.sources.modal.authBasic": "Username and password",
    "admin.sources.modal.probeTitle": "Test (preview) — saves nothing.",
    "admin.sources.modal.probePh": "Search query…",
    "admin.sources.modal.probeAria": "Test query",
    "admin.sources.modal.probeLoading": "Testing…",
    "admin.sources.modal.probeBtn": "Test",
    "admin.sources.modal.probeErrConfig": "Invalid configuration: {message}",
    "admin.sources.modal.probeErrUpstream": "The store did not respond: {message}",
    "admin.sources.modal.probeNoResults": "No results for that query.",
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
    "admin.nav.save.orchestration": "Orquestração",
    "admin.orchestration.title": "Orquestração (Save)",
    "admin.orchestration.subtitle": "Opere a descoberta e a correspondência por código de barras sem sair do admin.",
    "admin.orchestration.pending":
      "Módulo em construção. O acesso já está habilitado; as execuções, o agendamento e os indicadores chegam nas próximas entregas.",
    "admin.orchestration.runnerDown": "O orquestrador não responde. A configuração pode ser vista e editada; as métricas de execução não estão disponíveis.",
    "admin.orchestration.empty": "Ainda não há fluxos configurados. Crie um para começar a operar a descoberta.",
    "admin.orchestration.col.flow": "Fluxo",
    "admin.orchestration.col.provider": "Fornecedor",
    "admin.orchestration.col.mode": "Modo",
    "admin.orchestration.col.nextRun": "Próxima execução",
    "admin.orchestration.col.lastRun": "Última execução",
    "admin.orchestration.col.outcome": "Resultado",
    "admin.orchestration.col.actions": "Ações",
    "admin.orchestration.outcome.linkedPart": "{autoLinked} vinculados",
    "admin.orchestration.outcome.queuedPart": "{queued} na fila",
    "admin.orchestration.outcome.newPart": "{canonicals} novos",
    "admin.orchestration.outcome.queuedLinkTitle": "Ver na fila de revisão o que esta execução deixou",
    "admin.orchestration.mode.manual": "Manual",
    "admin.orchestration.mode.automatic_chain": "Automático (por dependência)",
    "admin.orchestration.mode.cron": "Agendado",
    "admin.orchestration.state.never": "Sem execuções",
    "admin.orchestration.state.queued": "Na fila",
    "admin.orchestration.state.running": "Executando",
    "admin.orchestration.state.canceling": "Cancelando",
    "admin.orchestration.state.succeeded": "Bem-sucedida",
    "admin.orchestration.state.failed": "Falhou",
    "admin.orchestration.state.canceled": "Cancelada",
    "admin.orchestration.state.unknown": "Desconhecido",
    "admin.orchestration.action.run": "Executar agora",
    "admin.orchestration.action.pause": "Pausar",
    "admin.orchestration.action.resume": "Ativar",
    "admin.orchestration.action.cancel": "Cancelar execução",
    "admin.orchestration.kpi.activeFlows": "Fluxos ativos",
    "admin.orchestration.kpi.activeFlows.hint": "Ativos sobre o total configurado",
    "admin.orchestration.kpi.newCanonicals": "Canônicos novos",
    "admin.orchestration.kpi.newCanonicals.hint": "Nasceram do que estas execuções descobriram",
    "admin.orchestration.col.status": "Estado",
    "admin.orchestration.col.schedule": "Horário",
    "admin.orchestration.col.products": "Produtos",
    "admin.orchestration.products.seen": "{seen} vistos",
    "admin.orchestration.products.breakdown": "{refreshed} atualizados · {matched} correspondidos · {discarded} descartados",
    "admin.orchestration.schedule.none": "Sem agendamento",
    "admin.orchestration.action.retry": "Tentar de novo",
    "admin.orchestration.action.edit": "Editar política",
    "admin.orchestration.action.delete": "Excluir fluxo",
    "admin.orchestration.actions.menuLabel": "Ações do fluxo",
    "admin.orchestration.confirm.back": "Voltar",
    "admin.orchestration.confirm.cancel.title": "Cancelar a execução em curso?",
    "admin.orchestration.confirm.cancel.body":
      "A execução para onde estiver. Os preços já ingeridos são mantidos e o que ficar por processar entra na próxima execução.",
    "admin.orchestration.confirm.cancel.accept": "Sim, cancelar a execução",
    "admin.orchestration.confirm.delete.title": "Excluir este fluxo?",
    "admin.orchestration.confirm.delete.body":
      "O fluxo deixa de aparecer na consola e não voltará a ser executado. O histórico das suas execuções é mantido intacto: é uma retirada reversível, não uma exclusão.",
    "admin.orchestration.confirm.delete.accept": "Sim, excluir o fluxo",
    "admin.orchestration.modal.title": "Editar política",
    "admin.orchestration.modal.save": "Salvar política",
    "admin.orchestration.modal.saving": "Salvando…",
    "admin.orchestration.modal.reset": "Restaurar",
    "admin.orchestration.modal.fieldMode": "Modo de execução",
    "admin.orchestration.modal.fieldCron": "Expressão cron",
    "admin.orchestration.modal.fieldTimezone": "Fuso horário",
    "admin.orchestration.modal.fieldSla": "SLA (minutos)",
    "admin.orchestration.modal.fieldQueryLimit": "Limite de consultas",
    "admin.orchestration.modal.hintCron":
      "Cinco campos (minuto hora dia mês dia-semana). Avaliado no fuso horário abaixo, não no do servidor.",
    "admin.orchestration.modal.hintQueryLimit": "Vazio = usa o limite global do mercado. Um 0 seria um limite de zero consultas.",
    "admin.orchestration.modal.hintSla": "Minutos tolerados desde a última execução BEM-SUCEDIDA. Só se aplica a fluxos agendados.",
    "admin.orchestration.modal.errCronRequired": "Um fluxo agendado precisa da sua expressão cron.",
    "admin.orchestration.modal.errSave": "Não foi possível salvar a política. Verifique os valores e tente de novo.",
    "admin.orchestration.modal.envTitle": "O que NÃO se configura aqui",
    "admin.orchestration.modal.envBody": "Estas peças ainda vivem em variáveis de ambiente do servidor e não podem ser alteradas pelo admin: o limite global de consultas (SAVE_REFRESH_QUERY_LIMIT) e os switches da cascata de correspondência, do classificador e do juiz LLM. Alterá-las exige uma mudança de configuração no deploy.",
    "admin.orchestration.create.cta": "Novo fluxo",
    "admin.orchestration.create.title": "Novo fluxo de fornecedor",
    "admin.orchestration.create.save": "Criar fluxo",
    "admin.orchestration.create.saving": "Criando…",
    "admin.orchestration.create.clear": "Limpar",
    "admin.orchestration.create.fieldProvider": "Fornecedor",
    "admin.orchestration.create.providerSearch": "Buscar fornecedor…",
    "admin.orchestration.create.providerAll": "Todos",
    "admin.orchestration.create.fieldFlow": "Fluxo",
    "admin.orchestration.create.hintFlow":
      "O fluxo nasce em modo manual: não dispara nada até você definir um horário em “Editar política”.",
    "admin.orchestration.create.errProviderRequired": "Escolha um fornecedor para o fluxo.",
    "admin.orchestration.create.errSave": "Não foi possível criar o fluxo.",
    "admin.orchestration.create.noProviders":
      "Todos os fornecedores do mercado já têm o seu fluxo configurado. Para reutilizar um, edite o existente.",
    "admin.orchestration.search.placeholder": "Buscar fornecedor ou fluxo…",
    "admin.orchestration.search.aria": "Buscar fluxos de orquestração",
    "admin.orchestration.filters": "Filtros",
    "admin.orchestration.filters.title": "Filtrar fluxos",
    "admin.orchestration.filters.mode": "Modo de execução",
    "admin.orchestration.filters.state": "Estado da última execução",
    "admin.orchestration.filters.all": "Todos",
    "admin.orchestration.filters.clear": "Restaurar",
    "admin.orchestration.filters.apply": "Aplicar filtros",
    "admin.orchestration.emptySearch": "Nenhum fluxo corresponde à busca ou aos filtros aplicados.",
    "admin.orchestration.pagination.show": "Mostrar",
    "admin.orchestration.pagination.perPage": "por página",
    "admin.orchestration.pagination.of": "{from}–{to} de {total}",
    "admin.orchestration.kpi.withinSla": "Dentro do SLA",
    "admin.orchestration.kpi.withinSla.hint": "Executaram a tempo. Os manuais não contam.",
    "admin.orchestration.kpi.autoLinkRate": "Taxa de auto-vínculo",
    "admin.orchestration.kpi.autoLinkRate.hint": "Resolvidos sem humano na última execução",
    "admin.orchestration.kpi.badge.allActive": "Todos ativos",
    "admin.orchestration.kpi.badge.paused": "{count} em pausa",
    "admin.orchestration.kpi.badge.onTime": "Todos em dia",
    "admin.orchestration.kpi.badge.breached": "{count} fora",
    "admin.orchestration.kpi.badge.queued": "{count} na fila",
    "admin.orchestration.kpi.badge.fromQueued": "de {count} na fila",
    "admin.orchestration.kpi.legend.autoLinked": "Auto-vinculados",
    "admin.orchestration.kpi.legend.queued": "Na fila",
    "admin.orchestration.kpi.legend.active": "Ativos",
    "admin.orchestration.kpi.legend.paused": "Em pausa",
    "admin.orchestration.kpi.legend.onTime": "Em dia",
    "admin.orchestration.kpi.legend.late": "Fora",
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
    "admin.topbar.language": "Idioma",
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
    "admin.reviewQueue.runFilter.label": "Filtrando pela execução",
    "admin.reviewQueue.runFilter.clear": "Remover filtro",
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
    "admin.reviewQueue.actions.viewInStore": "Ver na loja",
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
    "admin.basket.title": "Cesta curada",
    "admin.basket.info": "Termos de busca que a ingestão usa para montar a cesta (mercado {market}).",
    "admin.basket.search.aria": "Buscar na cesta",
    "admin.basket.search.placeholder": "Buscar query ou categoria…",
    "admin.basket.bulk.actions": "Ações",
    "admin.basket.bulk.delete": "Excluir",
    "admin.basket.bulk.confirmMsg": "Excluir {n} queries da cesta?",
    "admin.basket.bulk.confirm": "Confirmar exclusão",
    "admin.basket.add": "Adicionar query",
    "admin.basket.cancel": "Cancelar",
    "admin.basket.selectAll": "Selecionar todas",
    "admin.basket.col.query": "Query",
    "admin.basket.col.category": "Categoria",
    "admin.basket.col.status": "Status",
    "admin.basket.col.actions": "Ações",
    "admin.basket.empty": "Nenhuma query ainda.",
    "admin.basket.emptySearch": "Sem resultados para essa busca.",
    "admin.basket.pagination.show": "Mostrar",
    "admin.basket.pagination.perPage": "por página",
    "admin.basket.pagination.of": "de",
    "admin.basket.row.select": "Selecionar",
    "admin.basket.row.moveUp": "Subir",
    "admin.basket.row.moveDown": "Descer",
    "admin.basket.row.drag": "Arrastar",
    "admin.basket.row.active": "Ativa",
    "admin.basket.row.inactive": "Inativa",
    "admin.basket.row.confirmQ": "Excluir?",
    "admin.basket.row.confirm": "Confirmar",
    "admin.basket.row.confirmDeleteAria": "Confirmar exclusão",
    "admin.basket.row.actionsAria": "Ações",
    "admin.basket.row.edit": "Editar",
    "admin.basket.row.deactivate": "Desativar",
    "admin.basket.row.activate": "Ativar",
    "admin.basket.row.delete": "Excluir",
    "admin.basket.row.errToggle": "Não foi possível alterar o status.",
    "admin.basket.row.errDelete": "Não foi possível excluir a query.",
    "admin.basket.modal.titleAdd": "Adicionar query",
    "admin.basket.modal.titleEdit": "Editar query",
    "admin.basket.modal.clear": "Limpar",
    "admin.basket.modal.applyAdd": "Criar query",
    "admin.basket.modal.applyEdit": "Salvar alterações",
    "admin.basket.modal.saving": "Salvando…",
    "admin.basket.modal.errRequired": "A query é obrigatória.",
    "admin.basket.modal.errSave": "Não foi possível salvar as alterações.",
    "admin.basket.modal.errPreview": "Digite uma query para pré-visualizar.",
    "admin.basket.modal.fieldQuery": "Query",
    "admin.basket.modal.fieldCategory": "Categoria",
    "admin.basket.modal.phQuery": "ex. arroz la garza",
    "admin.basket.modal.phCategory": "ex. Grãos e legumes",
    "admin.basket.modal.previewBtn": "Pré-visualizar nas lojas",
    "admin.basket.modal.previewLoading": "Buscando…",
    "admin.basket.modal.previewNone": "Nenhuma loja retornou resultados para esse termo.",
    "admin.basket.modal.previewError": "erro",
    "admin.basket.modal.resultSing": "resultado",
    "admin.basket.modal.resultPlur": "resultados",
    "admin.basket.modal.noResults": "Sem resultados.",
    "admin.basket.modal.viewAria": "Ver",
    "admin.providers.title": "Fornecedores (Save)",
    "admin.providers.subtitle": "Cadastro e logo por URL colada (MVP, sem upload de arquivos).",
    "admin.providers.new": "Novo fornecedor",
    "admin.providers.field.name": "Nome",
    "admin.providers.field.market": "Mercado",
    "admin.providers.field.type": "Tipo",
    "admin.providers.field.platform": "Plataforma",
    "admin.providers.field.logo": "Logo (URL, opcional)",
    "admin.providers.create.submit": "Criar fornecedor",
    "admin.providers.create.error": "Não foi possível criar o fornecedor.",
    "admin.providers.existing": "Existentes",
    "admin.providers.empty": "Nenhum fornecedor ainda.",
    "admin.providers.update.nameError": "Não foi possível atualizar o nome.",
    "admin.providers.update.logoError": "Não foi possível salvar o logo.",
    "admin.providers.row.name": "Nome de {name}",
    "admin.providers.row.saveName": "Salvar nome de {name}",
    "admin.providers.row.logo": "Logo de {name}",
    "admin.providers.row.saveLogo": "Salvar logo de {name}",
    "admin.sources.title": "Fontes (Save)",
    "admin.sources.subtitle":
      "Configuração de extração por fornecedor. A auth (Bearer / API key) fica cifrada na fonte e é exibida mascarada. «Testar» é uma prévia — não salva nada.",
    "admin.sources.search.aria": "Buscar fontes",
    "admin.sources.search.placeholder": "Buscar por plataforma ou URL…",
    "admin.sources.view.grid": "Ver em cards",
    "admin.sources.view.list": "Ver em lista",
    "admin.sources.bulk.actions": "Ações",
    "admin.sources.bulk.pause": "Pausar selecionadas ({count})",
    "admin.sources.bulk.resume": "Retomar selecionadas ({count})",
    "admin.sources.add": "Adicionar fornecedor",
    "admin.sources.selectAll": "Selecionar tudo",
    "admin.sources.col.health": "Saúde",
    "admin.sources.col.logo": "Logo",
    "admin.sources.col.platform": "Plataforma",
    "admin.sources.col.url": "Base URL",
    "admin.sources.col.count": "Produtos",
    "admin.sources.col.lastSeen": "Última atualização",
    "admin.sources.col.actions": "Ações",
    "admin.sources.empty": "Nenhuma fonte ainda.",
    "admin.sources.emptySearch": "Sem resultados para essa busca.",
    "admin.sources.pagination.show": "Mostrar",
    "admin.sources.pagination.perPage": "por página",
    "admin.sources.pagination.of": "{from}–{to} de {total}",
    "admin.sources.count.unit": "produtos",
    "admin.sources.row.select": "Selecionar {name}",
    "admin.sources.health.ok": "OK",
    "admin.sources.health.stale": "Desatualizada",
    "admin.sources.health.paused": "Pausada",
    "admin.sources.actions.aria": "Ações de {name}",
    "admin.sources.actions.edit": "Editar",
    "admin.sources.actions.pause": "Pausar",
    "admin.sources.actions.resume": "Retomar",
    "admin.sources.actions.errPause": "Não foi possível pausar.",
    "admin.sources.actions.errResume": "Não foi possível retomar.",
    "admin.sources.modal.titleAdd": "Adicionar fornecedor",
    "admin.sources.modal.titleEdit": "Editar fonte",
    "admin.sources.modal.clear": "Limpar",
    "admin.sources.modal.saving": "Salvando…",
    "admin.sources.modal.saveEdit": "Salvar alterações",
    "admin.sources.modal.saveAdd": "Criar fonte",
    "admin.sources.modal.errProviderRequired": "O id do fornecedor é obrigatório.",
    "admin.sources.modal.errUrlRequired": "A Base URL é obrigatória.",
    "admin.sources.modal.errJsonInvalid": "JSON inválido em {label}",
    "admin.sources.modal.errSaveEdit": "Não foi possível salvar a fonte.",
    "admin.sources.modal.errSaveAdd": "Não foi possível criar a fonte.",
    "admin.sources.modal.fieldProvider": "Fornecedor",
    "admin.sources.modal.providerSearch": "Buscar fornecedor…",
    "admin.sources.modal.providerAll": "Selecione um fornecedor…",
    "admin.sources.modal.fieldPlatform": "Plataforma",
    "admin.sources.modal.fieldUrl": "Base URL",
    "admin.sources.modal.fieldAuth": "Autenticação",
    "admin.sources.modal.fieldTokenBearer": "Token (Bearer)",
    "admin.sources.modal.phTokenBearer": "Authorization: Bearer …",
    "admin.sources.modal.fieldLocation": "Localização",
    "admin.sources.modal.locationHeader": "Header",
    "admin.sources.modal.locationQuery": "Query",
    "admin.sources.modal.fieldHeaderName": "Nome do header",
    "admin.sources.modal.fieldKeyValue": "Token / valor (o segredo)",
    "admin.sources.modal.phKeyValue": "cole aqui o token da API",
    "admin.sources.modal.fieldUser": "Usuário",
    "admin.sources.modal.fieldPass": "Senha",
    "admin.sources.modal.advanced": "Avançado (Headers / Endpoints)",
    "admin.sources.modal.fieldHeaders": "Headers (JSON)",
    "admin.sources.modal.fieldEndpoints": "Endpoints (JSON)",
    "admin.sources.modal.authNone": "Nenhuma",
    "admin.sources.modal.authBearer": "Bearer token",
    "admin.sources.modal.authApiKey": "API key",
    "admin.sources.modal.authBasic": "Usuário e senha",
    "admin.sources.modal.probeTitle": "Testar (prévia) — não salva nada.",
    "admin.sources.modal.probePh": "Query de busca…",
    "admin.sources.modal.probeAria": "Query de teste",
    "admin.sources.modal.probeLoading": "Testando…",
    "admin.sources.modal.probeBtn": "Testar",
    "admin.sources.modal.probeErrConfig": "Configuração inválida: {message}",
    "admin.sources.modal.probeErrUpstream": "A loja não respondeu: {message}",
    "admin.sources.modal.probeNoResults": "Sem resultados para essa query.",
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
