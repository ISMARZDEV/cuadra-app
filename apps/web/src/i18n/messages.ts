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
  | "admin.orchestration.col.runOutcome"
  | "admin.orchestration.col.lastRun"
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
  | "admin.orchestration.action.detail"
  | "admin.orchestration.action.run"
  | "admin.orchestration.state.active"
  | "admin.orchestration.flow.provider_prices_refresh"
  | "admin.orchestration.state.paused"
  | "admin.orchestration.action.pause"
  | "admin.orchestration.action.resume"
  | "admin.orchestration.action.cancel"
  | "admin.orchestration.kpi.activeFlows"
  | "admin.orchestration.kpi.activeFlows.hint"
  | "admin.orchestration.kpi.newCanonicals"
  | "admin.orchestration.kpi.newCanonicals.hint"
  | "admin.orchestration.col.status"
  | "admin.orchestration.col.schedule"
  | "admin.orchestration.detail.slaWithin"
  | "admin.orchestration.detail.slaBreached"
  | "admin.orchestration.detail.slaNa"
  | "admin.orchestration.detail.back"
  | "admin.orchestration.detail.lastRunTitle"
  | "admin.orchestration.detail.trigger"
  | "admin.orchestration.detail.startedAt"
  | "admin.orchestration.detail.endedAt"
  | "admin.orchestration.detail.duration"
  | "admin.orchestration.detail.noRun"
  | "admin.orchestration.detail.resultsTitle"
  | "admin.orchestration.detail.healthTitle"
  | "admin.orchestration.detail.lastSync"
  | "admin.orchestration.detail.queryLimit"
  | "admin.orchestration.detail.queryLimitNone"
  | "admin.orchestration.detail.historyTitle"
  | "admin.orchestration.detail.historyUnavailable"
  | "admin.orchestration.detail.historyEmpty"
  | "admin.orchestration.detail.historyMore"
  | "admin.orchestration.detail.runnerDown"
  | "admin.orchestration.detail.activityTitle"
  | "admin.orchestration.detail.activityEmpty"
  | "admin.orchestration.detail.activityUnavailable"
  | "admin.orchestration.detail.activityShowAll"
  | "admin.orchestration.detail.activityShowKey"
  | "admin.orchestration.detail.activityHiddenCount"
  | "admin.orchestration.detail.activityLoadMore"
  | "admin.orchestration.detail.activityOfRun"
  | "admin.orchestration.detail.activityBackToCurrent"
  | "admin.orchestration.detail.rowSeeActivity"
  | "admin.orchestration.detail.failureTitle"
  | "admin.orchestration.detail.failureTechnical"
  | "admin.orchestration.event.queued"
  | "admin.orchestration.event.started"
  | "admin.orchestration.event.succeeded"
  | "admin.orchestration.event.canceled"
  | "admin.orchestration.event.failure"
  | "admin.orchestration.event.step"
  | "admin.orchestration.event.materialization"
  | "admin.orchestration.event.log"
  | "admin.orchestration.event.machinery"
  | "admin.orchestration.detail.colWhen"
  | "admin.orchestration.detail.colTrigger"
  | "admin.orchestration.detail.colState"
  | "admin.orchestration.detail.colDuration"
  | "admin.orchestration.detail.durationMinutes"
  | "admin.orchestration.detail.durationSeconds"
  | "admin.orchestration.detail.durationRunning"
  | "admin.orchestration.trigger.manual"
  | "admin.orchestration.trigger.automatic"
  | "admin.orchestration.trigger.retry"
  | "admin.orchestration.bulk.selected"
  | "admin.orchestration.bulk.run"
  | "admin.orchestration.bulk.pause"
  | "admin.orchestration.bulk.delete"
  | "admin.orchestration.bulk.selectAll"
  | "admin.orchestration.bulk.selectRow"
  | "admin.orchestration.bulk.deleteTitle"
  | "admin.orchestration.bulk.deleteBody"
  | "admin.orchestration.col.progress"
  | "admin.orchestration.col.progressHelp"
  | "admin.orchestration.col.runFunnel"
  | "admin.orchestration.col.runFunnelHelp"
  | "admin.orchestration.funnel.existing"
  | "admin.orchestration.funnel.linked"
  | "admin.orchestration.funnel.new"
  | "admin.orchestration.funnel.pending"
  | "admin.orchestration.products.queryProgress"
  | "admin.orchestration.products.queryProgressTitle"
  | "admin.orchestration.products.starting"
  | "admin.orchestration.products.startingHint"
  | "admin.orchestration.products.seenLabel"
  | "admin.orchestration.products.chipKnown"
  | "admin.orchestration.products.chipNew"
  | "admin.orchestration.products.seenHelp"
  | "admin.orchestration.products.knownHelp"
  | "admin.orchestration.products.newHelp"
  | "admin.orchestration.outcome.linkedHelp"
  | "admin.orchestration.outcome.queuedHelp"
  | "admin.orchestration.products.chipDiscarded"
  | "admin.orchestration.outcome.chipLinked"
  | "admin.orchestration.outcome.chipQueued"
  | "admin.orchestration.outcome.chipNew"
  | "admin.orchestration.outcome.nothing"
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
  | "admin.orchestration.tabs.flows"
  | "admin.orchestration.tabs.assets"
  | "admin.orchestration.assets.loading"
  | "admin.orchestration.assets.empty"
  | "admin.orchestration.assets.unavailableTitle"
  | "admin.orchestration.assets.unavailableHint"
  | "admin.orchestration.assets.partsProvider"
  | "admin.orchestration.assets.partsSection"
  | "admin.orchestration.assets.partsOther"
  | "admin.orchestration.assets.partitionsHelp"
  | "admin.orchestration.assets.partitionsDetail"
  | "admin.orchestration.assets.partitionsNone"
  | "admin.orchestration.assets.colAsset"
  | "admin.orchestration.assets.colGroup"
  | "admin.orchestration.assets.colJobs"
  | "admin.orchestration.assets.colPartitions"
  | "admin.orchestration.assets.colLastRun"
  | "admin.orchestration.assets.colHealth"
  | "admin.orchestration.assets.failedCount"
  | "admin.orchestration.assets.health.never_materialized"
  | "admin.orchestration.assets.health.healthy"
  | "admin.orchestration.assets.health.degraded"
  | "admin.orchestration.assets.health.failed"
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
  | "admin.reviewQueue.category.edit"
  | "admin.reviewQueue.category.search"
  | "admin.reviewQueue.category.noMatch"
  | "admin.toolbar.actions.classify"
  | "admin.toolbar.actions.canonize"
  | "admin.reviewQueue.canonize.title"
  | "admin.reviewQueue.canonize.description"
  | "admin.reviewQueue.canonize.confirm"
  | "admin.reviewQueue.canonize.missing"
  | "admin.reviewQueue.canonize.choose"
  | "admin.reviewQueue.canonize.onlyFillsGaps"
  | "admin.reviewQueue.canonize.done"
  | "admin.reviewQueue.canonize.preview"
  | "admin.reviewQueue.canonize.rowMissing"
  | "admin.reviewQueue.canonize.perPage"
  | "admin.reviewQueue.canonize.prev"
  | "admin.reviewQueue.canonize.next"
  | "admin.toolbar.actions.approve.noCandidates"
  | "admin.reviewQueue.classify.done"
  | "admin.reviewQueue.classify.undecided"
  | "admin.reviewQueue.classify.failed"
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
  | "admin.providers.add"
  | "admin.providers.search.aria"
  | "admin.providers.search.placeholder"
  | "admin.providers.emptySearch"
  | "admin.providers.selectAll"
  | "admin.providers.col.logo"
  | "admin.providers.col.name"
  | "admin.providers.col.market"
  | "admin.providers.col.type"
  | "admin.providers.col.platform"
  | "admin.providers.col.status"
  | "admin.providers.col.actions"
  | "admin.providers.status.active"
  | "admin.providers.status.archived"
  | "admin.providers.filters.title"
  | "admin.providers.filters.open"
  | "admin.providers.filters.type"
  | "admin.providers.filters.platform"
  | "admin.providers.filters.status"
  | "admin.providers.filters.all"
  | "admin.providers.filters.onlyActive"
  | "admin.providers.filters.onlyArchived"
  | "admin.providers.actions.aria"
  | "admin.providers.actions.edit"
  | "admin.providers.actions.archive"
  | "admin.providers.actions.unarchive"
  | "admin.providers.actions.errArchive"
  | "admin.providers.modal.editTitle"
  | "admin.providers.modal.cancel"
  | "admin.providers.modal.save"
  | "admin.providers.modal.saving"
  | "admin.providers.archive.title"
  | "admin.providers.archive.description"
  | "admin.providers.archive.confirm"
  | "admin.providers.pagination.show"
  | "admin.providers.pagination.perPage"
  | "admin.providers.pagination.of"
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
  | "admin.sources.modal.probeNoResults"
  | "admin.canonicalProducts.title"
  | "admin.canonicalProducts.subtitle"
  | "admin.canonicalProducts.search.aria"
  | "admin.canonicalProducts.search.placeholder"
  | "admin.canonicalProducts.empty"
  | "admin.canonicalProducts.emptySearch"
  | "admin.canonicalProducts.add"
  | "admin.canonicalProducts.import"
  | "admin.canonicalProducts.filters.button"
  | "admin.canonicalProducts.filters.title"
  | "admin.canonicalProducts.filters.clear"
  | "admin.canonicalProducts.filters.apply"
  | "admin.canonicalProducts.filters.quality"
  | "admin.canonicalProducts.filters.ean"
  | "admin.canonicalProducts.filters.minProviders"
  | "admin.canonicalProducts.filters.minProvidersHint"
  | "admin.canonicalProducts.filters.updatedSince"
  | "admin.canonicalProducts.filters.all"
  | "admin.canonicalProducts.filters.eanYes"
  | "admin.canonicalProducts.filters.eanNo"
  | "admin.canonicalProducts.col.image"
  | "admin.canonicalProducts.col.product"
  | "admin.canonicalProducts.col.brand"
  | "admin.canonicalProducts.col.size"
  | "admin.canonicalProducts.col.weight"
  | "admin.canonicalProducts.col.price"
  | "admin.canonicalProducts.noImage"
  | "admin.canonicalProducts.col.measure"
  | "admin.canonicalProducts.col.category"
  | "admin.canonicalProducts.col.providers"
  | "admin.canonicalProducts.col.completeness"
  | "admin.canonicalProducts.col.quality"
  | "admin.canonicalProducts.col.lastPrice"
  | "admin.canonicalProducts.col.actions"
  | "admin.canonicalProducts.measure.mass"
  | "admin.canonicalProducts.measure.volume"
  | "admin.canonicalProducts.measure.count"
  | "admin.canonicalProducts.status.complete"
  | "admin.canonicalProducts.status.no_image"
  | "admin.canonicalProducts.status.no_category"
  | "admin.canonicalProducts.status.no_providers"
  | "admin.canonicalProducts.status.stale_price"
  | "admin.canonicalProducts.status.possible_duplicate"
  | "admin.canonicalProducts.statusHint.complete"
  | "admin.canonicalProducts.statusHint.no_image"
  | "admin.canonicalProducts.statusHint.no_category"
  | "admin.canonicalProducts.statusHint.no_providers"
  | "admin.canonicalProducts.statusHint.stale_price"
  | "admin.canonicalProducts.statusHint.possible_duplicate"
  | "admin.canonicalProducts.ean.reachable"
  | "admin.canonicalProducts.ean.reachableHint"
  | "admin.canonicalProducts.actions.menuLabel"
  | "admin.canonicalProducts.actions.view"
  | "admin.canonicalProducts.actions.edit"
  | "admin.canonicalProducts.actions.providers"
  | "admin.canonicalProducts.actions.public"
  | "admin.canonicalProducts.actions.archive"
  | "admin.canonicalProducts.actions.archiveBlocked"
  | "admin.canonicalProducts.pagination.show"
  | "admin.canonicalProducts.pagination.perPage"
  | "admin.canonicalProducts.pagination.of"
  | "admin.canonicalProducts.providers.title"
  | "admin.canonicalProducts.providers.col.provider"
  | "admin.canonicalProducts.providers.col.price"
  | "admin.canonicalProducts.providers.col.lastSeen"
  | "admin.canonicalProducts.providers.col.action"
  | "admin.canonicalProducts.providers.cheapest"
  | "admin.canonicalProducts.providers.open"
  | "admin.canonicalProducts.providers.empty"
  | "admin.canonicalProducts.providers.loading"
  | "admin.canonicalProducts.form.name"
  | "admin.canonicalProducts.form.brand"
  | "admin.canonicalProducts.form.brandHint"
  | "admin.canonicalProducts.form.amount"
  | "admin.canonicalProducts.form.measure"
  | "admin.canonicalProducts.form.displaySize"
  | "admin.canonicalProducts.form.quality"
  | "admin.canonicalProducts.form.imageUrl"
  | "admin.canonicalProducts.form.cancel"
  | "admin.canonicalProducts.create.title"
  | "admin.canonicalProducts.create.subtitle"
  | "admin.canonicalProducts.create.submit"
  | "admin.canonicalProducts.create.submitting"
  | "admin.canonicalProducts.create.error"
  | "admin.canonicalProducts.edit.title"
  | "admin.canonicalProducts.edit.subtitle"
  | "admin.canonicalProducts.edit.submit"
  | "admin.canonicalProducts.edit.submitting"
  | "admin.canonicalProducts.edit.error"
  | "admin.canonicalProducts.import.title"
  | "admin.canonicalProducts.import.subtitle"
  | "admin.canonicalProducts.import.step1"
  | "admin.canonicalProducts.import.step2"
  | "admin.canonicalProducts.import.step3"
  | "admin.canonicalProducts.import.columns"
  | "admin.canonicalProducts.import.placeholder"
  | "admin.canonicalProducts.import.preview"
  | "admin.canonicalProducts.import.back"
  | "admin.canonicalProducts.import.confirm"
  | "admin.canonicalProducts.import.confirming"
  | "admin.canonicalProducts.import.valid"
  | "admin.canonicalProducts.import.invalid"
  | "admin.canonicalProducts.import.warnings"
  | "admin.canonicalProducts.import.noValidRows"
  | "admin.canonicalProducts.import.row"
  | "admin.canonicalProducts.import.done"
  | "admin.canonicalProducts.import.close"
  | "admin.canonicalProducts.import.error"
  | "admin.canonicalProducts.actions.unarchive"
  | "admin.canonicalProducts.archive.title"
  | "admin.canonicalProducts.archive.impact"
  | "admin.canonicalProducts.archive.confirm"
  | "admin.canonicalProducts.archive.cancel"
  | "admin.canonicalProducts.archive.badge"
  | "admin.canonicalProducts.filters.includeArchived"
  | "admin.canonicalProducts.form.description"
  | "admin.nav.save.canonicalProducts"
  | "admin.canonicalDetail.back"
  | "admin.canonicalDetail.notFound"
  | "admin.canonicalDetail.section.info"
  | "admin.canonicalDetail.section.providers"
  | "admin.canonicalDetail.section.history"
  | "admin.canonicalDetail.section.evidence"
  | "admin.canonicalDetail.section.duplicates"
  | "admin.canonicalDetail.section.activity"
  | "admin.canonicalDetail.info.slug"
  | "admin.canonicalDetail.info.size"
  | "admin.canonicalDetail.info.quality"
  | "admin.canonicalDetail.info.category"
  | "admin.canonicalDetail.info.description"
  | "admin.canonicalDetail.info.created"
  | "admin.canonicalDetail.info.originRun"
  | "admin.canonicalDetail.info.originRunNone"
  | "admin.canonicalDetail.info.lastMatch"
  | "admin.canonicalDetail.info.lastPrice"
  | "admin.canonicalDetail.info.empty"
  | "admin.canonicalDetail.kpi.min"
  | "admin.canonicalDetail.kpi.max"
  | "admin.canonicalDetail.kpi.spread"
  | "admin.canonicalDetail.kpi.providers"
  | "admin.canonicalDetail.kpi.change"
  | "admin.canonicalDetail.kpi.changes"
  | "admin.canonicalDetail.kpi.updated"
  | "admin.canonicalDetail.kpi.noData"
  | "admin.canonicalDetail.range.15d"
  | "admin.canonicalDetail.range.1m"
  | "admin.canonicalDetail.range.3m"
  | "admin.canonicalDetail.range.6m"
  | "admin.canonicalDetail.range.1y"
  | "admin.canonicalDetail.range.all"
  | "admin.canonicalDetail.chart.empty"
  | "admin.canonicalDetail.chart.carryIn"
  | "admin.canonicalDetail.evidence.col.provider"
  | "admin.canonicalDetail.evidence.col.raw"
  | "admin.canonicalDetail.evidence.col.ean"
  | "admin.canonicalDetail.evidence.col.method"
  | "admin.canonicalDetail.evidence.col.confidence"
  | "admin.canonicalDetail.evidence.empty"
  | "admin.canonicalDetail.evidence.human"
  | "admin.canonicalDetail.evidence.auto"
  | "admin.canonicalDetail.duplicates.empty"
  | "admin.canonicalDetail.duplicates.eanCollision"
  | "admin.canonicalDetail.duplicates.eanCollisionHint"
  | "admin.canonicalDetail.duplicates.sameBrandSize"
  | "admin.canonicalDetail.duplicates.readOnly"
  | "admin.canonicalDetail.activity.empty"
  | "admin.canonicalDetail.note.title"
  | "admin.canonicalDetail.note.hint"
  | "admin.canonicalDetail.note.placeholder"
  | "admin.canonicalDetail.note.save"
  | "admin.canonicalDetail.note.saving"
  | "admin.canonicalDetail.note.saved"
  | "admin.canonicalDetail.action.audit"
  | "admin.canonicalDetail.chart.loading"
  | "admin.canonicalDetail.chart.error"
  | "admin.canonicalDetail.section.image"
  | "admin.canonicalDetail.image.current"
  | "admin.canonicalDetail.image.candidates"
  | "admin.canonicalDetail.image.empty"
  | "admin.canonicalDetail.image.none"
  | "admin.canonicalDetail.image.use"
  | "admin.canonicalDetail.image.inUse"
  | "admin.canonicalDetail.image.hint"
  | "admin.canonicalDetail.image.uploadBlocked"
  | "admin.canonicalDetail.activity.by"
  | "admin.canonicalDetail.activity.action.create"
  | "admin.canonicalDetail.activity.action.import"
  | "admin.canonicalDetail.activity.action.update"
  | "admin.canonicalDetail.activity.action.archive"
  | "admin.canonicalDetail.activity.action.unarchive"
  | "admin.canonicalDetail.activity.action.note"
  | "admin.canonicalDetail.activity.action.addImage"
  | "admin.canonicalDetail.activity.action.removeImage"
  | "admin.canonicalDetail.activity.action.reorderImages"
  | "admin.canonicalDetail.activity.action.setCategory"
  | "admin.canonicalDetail.activity.action.regenerateSlug"
  | "admin.canonicalDetail.activity.action.unknown"
  | "admin.canonicalDetail.chart.retry"
  | "admin.canonicalDetail.activity.fields"
  | "admin.canonicalDetail.slug.action"
  | "admin.canonicalDetail.slug.title"
  | "admin.canonicalDetail.slug.warning"
  | "admin.canonicalDetail.slug.from"
  | "admin.canonicalDetail.slug.to"
  | "admin.canonicalDetail.slug.unchanged"
  | "admin.canonicalDetail.slug.confirm"
  | "admin.canonicalDetail.category.title"
  | "admin.canonicalDetail.category.suggestions"
  | "admin.canonicalDetail.category.suggestionsHint"
  | "admin.canonicalDetail.category.noSuggestions"
  | "admin.canonicalDetail.category.because"
  | "admin.canonicalDetail.category.all"
  | "admin.canonicalDetail.category.showTree"
  | "admin.canonicalDetail.category.hideTree"
  | "admin.canonicalDetail.category.search"
  | "admin.canonicalDetail.category.assign"
  | "admin.canonicalDetail.category.current"
  | "admin.canonicalDetail.category.signal.lexicon"
  | "admin.canonicalProducts.bulk.actions"
  | "admin.canonicalProducts.bulk.assignCategory"
  | "admin.canonicalProducts.bulk.selectAll"
  | "admin.canonicalProducts.bulk.title"
  | "admin.canonicalProducts.bulk.subtitle"
  | "admin.canonicalProducts.bulk.heterogeneous"
  | "admin.canonicalProducts.bulk.withoutSignal"
  | "admin.canonicalProducts.bulk.supportedBy"
  | "admin.canonicalProducts.bulk.apply"
  | "admin.canonicalProducts.bulk.applying"
  | "admin.canonicalProducts.bulk.done"
  | "admin.canonicalProducts.bulk.someFailed"
  | "admin.canonicalProducts.bulk.error"
  | "admin.canonicalProducts.bulk.close"
  | "admin.canonicalDetail.image.gallery"
  | "admin.canonicalDetail.image.position"
  | "admin.canonicalDetail.image.primary"
  | "admin.canonicalDetail.image.emptyGallery"
  | "admin.canonicalDetail.image.moveUp"
  | "admin.canonicalDetail.image.moveDown"
  | "admin.canonicalDetail.image.remove"
  | "admin.canonicalDetail.image.fromStore"
  | "admin.canonicalDetail.image.manual"
  | "admin.canonicalDetail.image.add"
  | "admin.canonicalDetail.image.added"
  | "admin.canonicalDetail.image.candidatesHint"
  | "admin.canonicalDetail.image.upload"
  | "admin.canonicalDetail.image.uploadSoon"
  | "admin.canonicalDetail.image.uploadSoonTitle"
  | "admin.canonicalDetail.image.understood"
  | "admin.canonicalDetail.image.confirmTitle"
  | "admin.canonicalDetail.image.confirmRemove"
  | "admin.canonicalDetail.image.confirmReorder"
  | "admin.canonicalDetail.image.confirmRemoveAccept"
  | "admin.canonicalDetail.image.confirmReorderAccept"
  | "admin.canonicalDetail.image.confirmCancel"
  | "admin.canonicalDetail.description.title"
  | "admin.canonicalDetail.description.current"
  | "admin.canonicalDetail.description.hint"
  | "admin.canonicalDetail.description.placeholder"
  | "admin.canonicalDetail.description.candidates"
  | "admin.canonicalDetail.description.use"
  | "admin.canonicalDetail.description.inUse"
  | "admin.canonicalDetail.description.empty"
  | "admin.canonicalDetail.description.save"
  | "admin.canonicalDetail.description.saving"
  | "admin.canonicalDetail.description.saved"
  | "admin.canonicalDetail.description.copyHint"
  | "admin.canonicalDetail.description.unsaved";

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
    "admin.orchestration.col.runOutcome": "Desenlace",
    "admin.orchestration.col.lastRun": "Última corrida",
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
    "admin.orchestration.action.detail": "Ver detalle",
    "admin.orchestration.action.run": "Ejecutar ahora",
    "admin.orchestration.state.active": "Activo",
    "admin.orchestration.flow.provider_prices_refresh": "Descubrimiento por búsqueda",
    "admin.orchestration.state.paused": "Pausado",
    "admin.orchestration.action.pause": "Pausar",
    "admin.orchestration.action.resume": "Activar",
    "admin.orchestration.action.cancel": "Cancelar corrida",
    "admin.orchestration.kpi.activeFlows": "Flujos activos",
    "admin.orchestration.kpi.activeFlows.hint": "Activos sobre el total configurado",
    "admin.orchestration.kpi.newCanonicals": "Canónicos nuevos",
    "admin.orchestration.kpi.newCanonicals.hint": "Nacieron de lo que estas corridas descubrieron",
    "admin.orchestration.col.status": "Estado",
    "admin.orchestration.col.schedule": "Horario",
    "admin.orchestration.detail.slaWithin": "Dentro del SLA",
    "admin.orchestration.detail.slaBreached": "Fuera del SLA",
    "admin.orchestration.detail.slaNa": "SLA N/A",
    "admin.orchestration.detail.back": "Volver a la consola",
    "admin.orchestration.detail.lastRunTitle": "Última corrida",
    "admin.orchestration.detail.trigger": "Disparada por",
    "admin.orchestration.detail.startedAt": "Inicio",
    "admin.orchestration.detail.endedAt": "Fin",
    "admin.orchestration.detail.duration": "Duración",
    "admin.orchestration.detail.noRun": "Este flujo todavía no tuvo ninguna corrida.",
    "admin.orchestration.detail.resultsTitle": "Resultados de la corrida",
    "admin.orchestration.detail.healthTitle": "Salud y SLA",
    "admin.orchestration.detail.lastSync": "Última sincronización exitosa",
    "admin.orchestration.detail.queryLimit": "Límite de búsquedas efectivo",
    "admin.orchestration.detail.queryLimitNone": "Sin límite",
    "admin.orchestration.detail.historyTitle": "Histórico de corridas",
    "admin.orchestration.detail.historyUnavailable": "No pudimos consultar el histórico del orquestador.",
    "admin.orchestration.detail.historyEmpty": "Sin corridas en el histórico.",
    "admin.orchestration.detail.historyMore": "Cargar más",
    "admin.orchestration.detail.runnerDown": "No pudimos consultar el orquestador. La configuración de abajo sigue disponible; el estado de las corridas volverá cuando el runner responda.",
    "admin.orchestration.detail.activityTitle": "Actividad",
    "admin.orchestration.detail.activityEmpty": "Esta corrida no registró eventos.",
    "admin.orchestration.detail.activityUnavailable": "No pudimos leer la actividad de esta corrida.",
    "admin.orchestration.detail.activityShowAll": "Ver todo",
    "admin.orchestration.detail.activityShowKey": "Ver lo esencial",
    "admin.orchestration.detail.activityHiddenCount": "{n} de maquinaria oculta",
    "admin.orchestration.detail.activityLoadMore": "Cargar más eventos",
    "admin.orchestration.detail.activityOfRun": "Corrida del {when}",
    "admin.orchestration.detail.activityBackToCurrent": "Volver a la última",
    "admin.orchestration.detail.rowSeeActivity": "Ver la actividad de esta corrida",
    "admin.orchestration.detail.failureTitle": "Por qué falló",
    "admin.orchestration.detail.failureTechnical": "Detalle técnico",
    "admin.orchestration.event.queued": "En cola",
    "admin.orchestration.event.started": "Arrancó",
    "admin.orchestration.event.succeeded": "Terminó bien",
    "admin.orchestration.event.canceled": "Cancelada",
    "admin.orchestration.event.failure": "Falló",
    "admin.orchestration.event.step": "Paso",
    "admin.orchestration.event.materialization": "Produjo",
    "admin.orchestration.event.log": "Registro",
    "admin.orchestration.event.machinery": "Sistema",
    "admin.orchestration.detail.colWhen": "Cuándo",
    "admin.orchestration.detail.colTrigger": "Disparo",
    "admin.orchestration.detail.colState": "Estado",
    "admin.orchestration.detail.colDuration": "Duración",
    "admin.orchestration.detail.durationMinutes": "{minutes}m {seconds}s",
    "admin.orchestration.detail.durationSeconds": "{seconds}s",
    "admin.orchestration.detail.durationRunning": "En curso",
    "admin.orchestration.trigger.manual": "Manual",
    "admin.orchestration.trigger.automatic": "Programada",
    "admin.orchestration.trigger.retry": "Reintento",
    "admin.orchestration.bulk.selected": "{count} seleccionado(s)",
    "admin.orchestration.bulk.run": "Ejecutar seleccionados",
    "admin.orchestration.bulk.pause": "Pausar seleccionados",
    "admin.orchestration.bulk.delete": "Eliminar seleccionados",
    "admin.orchestration.bulk.selectAll": "Seleccionar todos los flujos de la página",
    "admin.orchestration.bulk.selectRow": "Seleccionar este flujo",
    "admin.orchestration.bulk.deleteTitle": "¿Eliminar {count} flujo(s)?",
    "admin.orchestration.bulk.deleteBody": "Dejan de programarse y desaparecen de la consola. El histórico de sus corridas se conserva: no se borra nada de lo que ya ocurrió.",
    "admin.orchestration.col.progress": "Progreso",
    "admin.orchestration.col.progressHelp": "Cuánto avanzó la corrida. El número es el total de productos que la tienda devolvió; la barra, cuántas de las búsquedas de la canasta ya terminaron.",
    "admin.orchestration.col.runFunnel": "Resultado de la corrida",
    "admin.orchestration.col.runFunnelHelp": "Cómo terminó la última corrida, en dos niveles. Arriba: de todo lo que la tienda devolvió, cuánto ya teníamos y cuánto era nuevo. Abajo: de esos NUEVOS —no del total—, cuántos el sistema pudo enlazar solo y cuántos quedaron esperando a una persona. Pasá el cursor por cada etiqueta para el detalle.",
    "admin.orchestration.funnel.existing": "Existentes",
    "admin.orchestration.funnel.linked": "Vinculados",
    "admin.orchestration.funnel.new": "Nuevos",
    "admin.orchestration.funnel.pending": "Pendientes",
    "admin.orchestration.products.queryProgress": "{processed}/{total} Búsquedas",
    "admin.orchestration.products.queryProgressTitle": "Búsquedas ejecutadas sobre las planificadas. Es el progreso REAL de la corrida: el número de productos no lo dice, porque una búsqueda puede devolver muchos o ninguno.",
    "admin.orchestration.products.starting": "Iniciando…",
    "admin.orchestration.products.startingHint": "La corrida arrancó pero todavía no ejecutó ninguna búsqueda. El runner tarda unos segundos en levantar el proceso.",
    "admin.orchestration.products.seenLabel": "productos",
    "admin.orchestration.products.chipKnown": "{n} Ya conocidos",
    "admin.orchestration.products.chipNew": "{n} Nuevos",
    "admin.orchestration.products.seenHelp": "Todo lo que la tienda devolvió en esta corrida, contando repeticiones: si un mismo producto aparece en dos búsquedas distintas de la canasta, se cuenta dos veces. Es volumen bruto, no productos distintos.",
    "admin.orchestration.products.knownHelp": "Productos que ya teníamos en la base. Solo se les registró el precio de hoy: no vuelven a pasar por el emparejamiento. En la primera corrida de una tienda casi no hay; en las siguientes deberían ser la mayoría.",
    "admin.orchestration.products.newHelp": "Productos que no teníamos y entraron al emparejamiento automático. «Nuevo» describe de dónde vienen, no cómo terminaron: el desenlace es la barra de abajo.",
    "admin.orchestration.outcome.linkedHelp": "El sistema decidió solo a qué producto del catálogo corresponden, con confianza suficiente para no consultar a nadie. Nadie los revisó a mano.",
    "admin.orchestration.outcome.queuedHelp": "Quedaron sin decidir y esperan a una persona en la Cola de revisión. No es un error: ante la duda el sistema prefiere preguntar antes que inventar un enlace.",
    "admin.orchestration.products.chipDiscarded": "{n} Descartados",
    "admin.orchestration.outcome.chipLinked": "{n} Enlazados",
    "admin.orchestration.outcome.chipQueued": "{n} A la cola",
    "admin.orchestration.outcome.chipNew": "{n} Nuevos",
    "admin.orchestration.outcome.nothing": "Sin resultados todavía",
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
    "admin.orchestration.tabs.flows": "Proveedores",
    "admin.orchestration.tabs.assets": "Assets Dagster",
    "admin.orchestration.assets.loading": "Consultando el orquestador…",
    "admin.orchestration.assets.empty": "El orquestador respondió, pero no declara ningún asset.",
    "admin.orchestration.assets.unavailableTitle": "No pudimos consultar el orquestador",
    "admin.orchestration.assets.unavailableHint": "Los assets viven solo en Dagster, así que no hay nada que mostrar hasta que responda. Las políticas de la pestaña Proveedores siguen disponibles.",
    "admin.orchestration.assets.partsProvider": "supermercados",
    "admin.orchestration.assets.partsSection": "secciones del catálogo",
    "admin.orchestration.assets.partsOther": "partes",
    "admin.orchestration.assets.partitionsHelp": "Algunos procesos se ejecutan por partes independientes: una por supermercado, o una por sección del catálogo. Cada parte se lanza y se reintenta sola, así que si una falla las demás siguen. El número indica cuántas partes ya terminaron bien. (En Dagster a esto se le llama «materializar».)",
    "admin.orchestration.assets.partitionsDetail": "{materialized} de {total} {noun} ya se procesaron bien.",
    "admin.orchestration.assets.partitionsNone": "Este proceso no se divide en partes: se ejecuta entero, de una sola vez.",
    "admin.orchestration.assets.colAsset": "Asset",
    "admin.orchestration.assets.colGroup": "Grupo",
    "admin.orchestration.assets.colJobs": "Jobs",
    "admin.orchestration.assets.colPartitions": "Particiones",
    "admin.orchestration.assets.colLastRun": "Última ejecución",
    "admin.orchestration.assets.colHealth": "Estado",
    "admin.orchestration.assets.failedCount": "({count} con fallo)",
    "admin.orchestration.assets.health.never_materialized": "Nunca se ejecutó",
    "admin.orchestration.assets.health.healthy": "Sano",
    "admin.orchestration.assets.health.degraded": "Degradado",
    "admin.orchestration.assets.health.failed": "Con fallo",
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
    "admin.reviewQueue.category.edit": "Cambiar categoría",
    "admin.reviewQueue.category.search": "Buscar categoría...",
    "admin.reviewQueue.category.noMatch": "Ninguna categoría coincide",
    "admin.toolbar.actions.classify": "Clasificar seleccionados",
    "admin.toolbar.actions.canonize": "Aprobar y crear canónico",
    "admin.reviewQueue.canonize.title": "Crear canónicos",
    "admin.reviewQueue.canonize.description": "Se crearán {n} productos canónicos nuevos y se enlazarán a estas filas. No se puede deshacer.",
    "admin.reviewQueue.canonize.confirm": "Crear {n} canónicos",
    "admin.reviewQueue.canonize.missing": "{n} sin categoría — elegí una para esas filas",
    "admin.reviewQueue.canonize.choose": "Elegir categoría...",
    "admin.reviewQueue.canonize.onlyFillsGaps": "Solo se aplica a las que no tienen. Las demás conservan la suya.",
    "admin.reviewQueue.canonize.done": "{n} canónicos creados",
    "admin.reviewQueue.canonize.preview": "Qué se va a crear",
    "admin.reviewQueue.canonize.rowMissing": "Falta categoría",
    "admin.reviewQueue.canonize.perPage": "Por página",
    "admin.reviewQueue.canonize.prev": "Página anterior",
    "admin.reviewQueue.canonize.next": "Página siguiente",
    "admin.toolbar.actions.approve.noCandidates": "Ninguna de las filas seleccionadas tiene candidatos. Usá \"Aprobar y crear canónico\".",
    "admin.reviewQueue.classify.done": "{n} clasificadas",
    "admin.reviewQueue.classify.undecided": "{n} sin decidir",
    "admin.reviewQueue.classify.failed": "{n} con error",
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
    "admin.providers.subtitle": "Gestión de cadenas y sus fuentes de datos. El logo se define por URL pegada (sin subida de archivos).",
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
    "admin.providers.add": "Añadir proveedor",
    "admin.providers.search.aria": "Buscar proveedor",
    "admin.providers.search.placeholder": "Buscar proveedor...",
    "admin.providers.emptySearch": "Ningún proveedor coincide con la búsqueda.",
    "admin.providers.selectAll": "Seleccionar todos los proveedores de la página",
    "admin.providers.col.logo": "Logo",
    "admin.providers.col.name": "Nombre",
    "admin.providers.col.market": "Mercado",
    "admin.providers.col.type": "Tipo",
    "admin.providers.col.platform": "Plataforma",
    "admin.providers.col.status": "Estado",
    "admin.providers.col.actions": "Acciones",
    "admin.providers.status.active": "Activo",
    "admin.providers.status.archived": "Archivado",
    "admin.providers.filters.title": "Filtrar proveedores",
    "admin.providers.filters.open": "Abrir filtros",
    "admin.providers.filters.type": "Tipo",
    "admin.providers.filters.platform": "Plataforma",
    "admin.providers.filters.status": "Estado",
    "admin.providers.filters.all": "Todos",
    "admin.providers.filters.onlyActive": "Solo activos",
    "admin.providers.filters.onlyArchived": "Solo archivados",
    "admin.providers.actions.aria": "Acciones de {name}",
    "admin.providers.actions.edit": "Editar",
    "admin.providers.actions.archive": "Archivar",
    "admin.providers.actions.unarchive": "Restaurar",
    "admin.providers.actions.errArchive": "No se pudo cambiar el estado del proveedor.",
    "admin.providers.modal.editTitle": "Editar {name}",
    "admin.providers.modal.cancel": "Cancelar",
    "admin.providers.modal.save": "Guardar cambios",
    "admin.providers.modal.saving": "Guardando...",
    "admin.providers.archive.title": "¿Archivar {name}?",
    "admin.providers.archive.description": "Deja de aparecer en la consola y en la ingesta. Su histórico de precios, sus productos y su configuración quedan intactos, y puedes restaurarlo cuando quieras.",
    "admin.providers.archive.confirm": "Archivar proveedor",
    "admin.providers.pagination.show": "Mostrar",
    "admin.providers.pagination.perPage": "por página",
    "admin.providers.pagination.of": "{from}-{to} de {total}",
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
    "admin.canonicalProducts.title": "Productos Canónicos (Save)",
    "admin.canonicalProducts.subtitle": "Catálogo canónico: qué existe, con cuántas tiendas está enlazado y qué le falta para estar completo.",
    "admin.canonicalProducts.search.aria": "Buscar productos canónicos",
    "admin.canonicalProducts.search.placeholder": "Buscar por nombre, marca o slug…",
    "admin.canonicalProducts.empty": "Todavía no hay productos canónicos.",
    "admin.canonicalProducts.emptySearch": "Ningún producto coincide con esa búsqueda.",
    "admin.canonicalProducts.add": "Añadir canónico",
    "admin.canonicalProducts.import": "Importar",
    "admin.canonicalProducts.filters.button": "Filtros",
    "admin.canonicalProducts.filters.title": "Filtrar catálogo",
    "admin.canonicalProducts.filters.clear": "Limpiar",
    "admin.canonicalProducts.filters.apply": "Aplicar",
    "admin.canonicalProducts.filters.quality": "Estado",
    "admin.canonicalProducts.filters.ean": "EAN",
    "admin.canonicalProducts.filters.minProviders": "Cobertura mínima",
    "admin.canonicalProducts.filters.minProvidersHint": "Sólo canónicos con al menos esta cantidad de tiendas enlazadas.",
    "admin.canonicalProducts.filters.updatedSince": "Precio visto desde",
    "admin.canonicalProducts.filters.all": "Todos",
    "admin.canonicalProducts.filters.eanYes": "Con EAN",
    "admin.canonicalProducts.filters.eanNo": "Sin EAN",
    "admin.canonicalProducts.col.image": "Imagen",
    "admin.canonicalProducts.col.product": "Producto",
    "admin.canonicalProducts.col.brand": "Marca",
    "admin.canonicalProducts.col.size": "Tamaño",
    "admin.canonicalProducts.col.weight": "Peso",
    "admin.canonicalProducts.col.price": "Precio",
    "admin.canonicalProducts.noImage": "Sin imagen",
    "admin.canonicalProducts.col.measure": "Unidad",
    "admin.canonicalProducts.col.category": "Categoría",
    "admin.canonicalProducts.col.providers": "Tiendas",
    "admin.canonicalProducts.col.completeness": "Completitud",
    "admin.canonicalProducts.col.quality": "Estado",
    "admin.canonicalProducts.col.lastPrice": "Último precio",
    "admin.canonicalProducts.col.actions": "Acciones",
    "admin.canonicalProducts.measure.mass": "Masa",
    "admin.canonicalProducts.measure.volume": "Volumen",
    "admin.canonicalProducts.measure.count": "Unidades",
    "admin.canonicalProducts.status.complete": "Completo",
    "admin.canonicalProducts.status.no_image": "Sin imagen",
    "admin.canonicalProducts.status.no_category": "Sin categoría",
    "admin.canonicalProducts.status.no_providers": "Sin tiendas",
    "admin.canonicalProducts.status.stale_price": "Precio viejo",
    "admin.canonicalProducts.status.possible_duplicate": "Duplicado posible",
    "admin.canonicalProducts.statusHint.complete": "No le falta nada: tiene imagen, categoría, calidad, tiendas enlazadas y precio fresco.",
    "admin.canonicalProducts.statusHint.no_image": "Falta la imagen. Se puede tomar de una tienda enlazada desde el detalle.",
    "admin.canonicalProducts.statusHint.no_category": "Sin categoría asignada: no aparece en el árbol de navegación público.",
    "admin.canonicalProducts.statusHint.no_providers": "Ninguna tienda está enlazada a este canónico, así que no tiene precio que comparar.",
    "admin.canonicalProducts.statusHint.stale_price": "Ninguna corrida actualizó el precio de este producto en más de una semana.",
    "admin.canonicalProducts.statusHint.possible_duplicate": "Otro canónico comparte EAN o marca y tamaño con este. Revisalo antes de que contamine las comparaciones.",
    "admin.canonicalProducts.ean.reachable": "Alcanzable por EAN",
    "admin.canonicalProducts.ean.reachableHint": "Al menos una tienda enlazada trae EAN: el matcheo por código de barras puede cubrirlo.",
    "admin.canonicalProducts.actions.menuLabel": "Acciones del producto",
    "admin.canonicalProducts.actions.view": "Ver detalle",
    "admin.canonicalProducts.actions.edit": "Editar",
    "admin.canonicalProducts.actions.providers": "Ver proveedores",
    "admin.canonicalProducts.actions.public": "Ver página pública",
    "admin.canonicalProducts.actions.archive": "Archivar",
    "admin.canonicalProducts.actions.archiveBlocked": "Archivar todavía no está disponible: requiere una migración del modelo (archived_at).",
    "admin.canonicalProducts.pagination.show": "Mostrar",
    "admin.canonicalProducts.pagination.perPage": "por página",
    "admin.canonicalProducts.pagination.of": "{from}–{to} de {total}",
    "admin.canonicalProducts.providers.title": "Proveedores matcheados",
    "admin.canonicalProducts.providers.col.provider": "Tienda",
    "admin.canonicalProducts.providers.col.price": "Precio",
    "admin.canonicalProducts.providers.col.lastSeen": "Actualizado",
    "admin.canonicalProducts.providers.col.action": "Tienda online",
    "admin.canonicalProducts.providers.cheapest": "Mejor precio",
    "admin.canonicalProducts.providers.open": "Abrir",
    "admin.canonicalProducts.providers.empty": "Ninguna tienda está enlazada a este producto.",
    "admin.canonicalProducts.providers.loading": "Cargando…",
    "admin.canonicalProducts.form.name": "Nombre",
    "admin.canonicalProducts.form.brand": "Marca",
    "admin.canonicalProducts.form.brandHint": "Se guarda en MAYÚSCULA para que no convivan variantes de la misma marca.",
    "admin.canonicalProducts.form.amount": "Cantidad",
    "admin.canonicalProducts.form.measure": "Unidad",
    "admin.canonicalProducts.form.displaySize": "Tamaño de empaque",
    "admin.canonicalProducts.form.quality": "Calidad",
    "admin.canonicalProducts.form.imageUrl": "URL de imagen",
    "admin.canonicalProducts.form.cancel": "Cancelar",
    "admin.canonicalProducts.create.title": "Añadir producto canónico",
    "admin.canonicalProducts.create.subtitle": "Nace sin tiendas enlazadas. El slug público se genera solo y no cambia después.",
    "admin.canonicalProducts.create.submit": "Crear producto",
    "admin.canonicalProducts.create.submitting": "Creando…",
    "admin.canonicalProducts.create.error": "No se pudo crear el producto.",
    "admin.canonicalProducts.edit.title": "Editar producto canónico",
    "admin.canonicalProducts.edit.subtitle": "El slug público NO cambia al editar: es la dirección del producto y romperla rompería los enlaces compartidos.",
    "admin.canonicalProducts.edit.submit": "Guardar cambios",
    "admin.canonicalProducts.edit.submitting": "Guardando…",
    "admin.canonicalProducts.edit.error": "No se pudieron guardar los cambios.",
    "admin.canonicalProducts.import.title": "Importar canónicos",
    "admin.canonicalProducts.import.subtitle": "Pegá el CSV, revisá qué va a pasar y recién ahí confirmá.",
    "admin.canonicalProducts.import.step1": "1. Pegar",
    "admin.canonicalProducts.import.step2": "2. Previsualizar",
    "admin.canonicalProducts.import.step3": "3. Confirmar",
    "admin.canonicalProducts.import.columns": "Columnas: name, brand, size_amount, size_measure, display_size, quality, image_url",
    "admin.canonicalProducts.import.placeholder": "name,brand,size_amount,size_measure\nArroz Blanco,GOYA,5,mass",
    "admin.canonicalProducts.import.preview": "Previsualizar",
    "admin.canonicalProducts.import.back": "Volver",
    "admin.canonicalProducts.import.confirm": "Importar {count}",
    "admin.canonicalProducts.import.confirming": "Importando…",
    "admin.canonicalProducts.import.valid": "{count} listas para importar",
    "admin.canonicalProducts.import.invalid": "{count} con error",
    "admin.canonicalProducts.import.warnings": "{count} avisos",
    "admin.canonicalProducts.import.noValidRows": "Ninguna fila del archivo es válida. Corregí los errores y volvé a previsualizar.",
    "admin.canonicalProducts.import.row": "Fila {n}",
    "admin.canonicalProducts.import.done": "Se importaron {count} productos.",
    "admin.canonicalProducts.import.close": "Cerrar",
    "admin.canonicalProducts.import.error": "No se pudo procesar la importación.",
    "admin.canonicalProducts.actions.unarchive": "Restaurar",
    "admin.canonicalProducts.archive.title": "¿Archivar este producto canónico?",
    "admin.canonicalProducts.archive.impact": "Dejará de aparecer en el sitio público, en las comparaciones y en los rails de categoría. NO se borra: el histórico de precios, las tiendas enlazadas y el enlace público se conservan, y podés restaurarlo cuando quieras.",
    "admin.canonicalProducts.archive.confirm": "Archivar",
    "admin.canonicalProducts.archive.cancel": "Cancelar",
    "admin.canonicalProducts.archive.badge": "Archivado",
    "admin.canonicalProducts.filters.includeArchived": "Mostrar archivados",
    "admin.canonicalProducts.form.description": "Descripción",
    "admin.nav.save.canonicalProducts": "Productos canónicos",
    "admin.canonicalDetail.back": "Volver al catálogo",
    "admin.canonicalDetail.notFound": "Este producto canónico no existe.",
    "admin.canonicalDetail.section.info": "Información canónica",
    "admin.canonicalDetail.section.providers": "Proveedores matcheados",
    "admin.canonicalDetail.section.history": "Histórico y KPIs",
    "admin.canonicalDetail.section.evidence": "Evidencia",
    "admin.canonicalDetail.section.duplicates": "Duplicados posibles",
    "admin.canonicalDetail.section.activity": "Actividad y notas",
    "admin.canonicalDetail.info.slug": "Slug público",
    "admin.canonicalDetail.info.size": "Tamaño",
    "admin.canonicalDetail.info.quality": "Calidad",
    "admin.canonicalDetail.info.category": "Categoría",
    "admin.canonicalDetail.info.description": "Descripción",
    "admin.canonicalDetail.info.created": "Creado",
    "admin.canonicalDetail.info.originRun": "Descubierto en la corrida",
    "admin.canonicalDetail.info.originRunNone": "Alta manual o anterior a la orquestación",
    "admin.canonicalDetail.info.lastMatch": "Último match",
    "admin.canonicalDetail.info.lastPrice": "Último precio visto",
    "admin.canonicalDetail.info.empty": "—",
    "admin.canonicalDetail.kpi.min": "Precio mínimo",
    "admin.canonicalDetail.kpi.max": "Precio máximo",
    "admin.canonicalDetail.kpi.spread": "Diferencia",
    "admin.canonicalDetail.kpi.providers": "Tiendas activas",
    "admin.canonicalDetail.kpi.change": "Variación del rango",
    "admin.canonicalDetail.kpi.changes": "Cambios de precio",
    "admin.canonicalDetail.kpi.updated": "Actualizado",
    "admin.canonicalDetail.kpi.noData": "Sin histórico suficiente para calcular KPIs.",
    "admin.canonicalDetail.range.15d": "15 días",
    "admin.canonicalDetail.range.1m": "1 mes",
    "admin.canonicalDetail.range.3m": "3 meses",
    "admin.canonicalDetail.range.6m": "6 meses",
    "admin.canonicalDetail.range.1y": "1 año",
    "admin.canonicalDetail.range.all": "Todo",
    "admin.canonicalDetail.chart.empty": "Todavía no hay histórico de precios para este producto.",
    "admin.canonicalDetail.chart.carryIn": "El primer punto de cada línea es el precio que ya venía vigente al empezar el rango.",
    "admin.canonicalDetail.evidence.col.provider": "Tienda",
    "admin.canonicalDetail.evidence.col.raw": "Nombre en la tienda",
    "admin.canonicalDetail.evidence.col.ean": "EAN / SKU",
    "admin.canonicalDetail.evidence.col.method": "Cómo se enlazó",
    "admin.canonicalDetail.evidence.col.confidence": "Confianza",
    "admin.canonicalDetail.evidence.empty": "Ninguna tienda está enlazada a este canónico.",
    "admin.canonicalDetail.evidence.human": "Decidido por una persona",
    "admin.canonicalDetail.evidence.auto": "Enlace automático",
    "admin.canonicalDetail.duplicates.empty": "No se detectaron duplicados posibles.",
    "admin.canonicalDetail.duplicates.eanCollision": "Mismo EAN",
    "admin.canonicalDetail.duplicates.eanCollisionHint": "Otro canónico comparte código de barras con este: es la señal más fuerte de que son el mismo producto.",
    "admin.canonicalDetail.duplicates.sameBrandSize": "Misma marca y tamaño",
    "admin.canonicalDetail.duplicates.readOnly": "Sólo alerta: unir o separar canónicos no está disponible todavía.",
    "admin.canonicalDetail.activity.empty": "Todavía nadie modificó este canónico.",
    "admin.canonicalDetail.note.title": "Nota interna",
    "admin.canonicalDetail.note.hint": "Sólo visible en el admin. Nunca aparece en la página pública.",
    "admin.canonicalDetail.note.placeholder": "Coordinación del equipo sobre este producto…",
    "admin.canonicalDetail.note.save": "Guardar nota",
    "admin.canonicalDetail.note.saving": "Guardando…",
    "admin.canonicalDetail.note.saved": "Nota guardada",
    "admin.canonicalDetail.action.audit": "Actividad",
    "admin.canonicalDetail.chart.loading": "Cargando histórico…",
    "admin.canonicalDetail.chart.error": "No se pudo cargar el histórico de precios. Reintentá en un momento.",
    "admin.canonicalDetail.section.image": "Imagen del producto",
    "admin.canonicalDetail.image.current": "Imagen actual",
    "admin.canonicalDetail.image.candidates": "Tomar de una tienda",
    "admin.canonicalDetail.image.empty": "Ninguna tienda enlazada trae imagen. Podés pegar una URL desde Editar.",
    "admin.canonicalDetail.image.none": "Sin imagen",
    "admin.canonicalDetail.image.use": "Usar esta",
    "admin.canonicalDetail.image.inUse": "En uso",
    "admin.canonicalDetail.image.hint": "Copia la URL de la tienda al canónico. No modifica el producto de la tienda.",
    "admin.canonicalDetail.image.uploadBlocked": "Subir una imagen desde el ordenador requiere definir el almacenamiento de archivos.",
    "admin.canonicalDetail.activity.by": "por",
    "admin.canonicalDetail.activity.action.create": "Alta manual",
    "admin.canonicalDetail.activity.action.import": "Importación masiva",
    "admin.canonicalDetail.activity.action.update": "Edición",
    "admin.canonicalDetail.activity.action.archive": "Archivado",
    "admin.canonicalDetail.activity.action.unarchive": "Restaurado",
    "admin.canonicalDetail.activity.action.note": "Nota interna",
    "admin.canonicalDetail.activity.action.addImage": "Imagen agregada",
    "admin.canonicalDetail.activity.action.removeImage": "Imagen quitada",
    "admin.canonicalDetail.activity.action.reorderImages": "Imágenes reordenadas",
    "admin.canonicalDetail.activity.action.setCategory": "Categoría asignada",
    "admin.canonicalDetail.activity.action.regenerateSlug": "Slug regenerado",
    "admin.canonicalDetail.activity.action.unknown": "Cambio en el producto",
    "admin.canonicalDetail.chart.retry": "Reintentar",
    "admin.canonicalDetail.activity.fields": "Campos:",
    "admin.canonicalDetail.slug.action": "Regenerar slug",
    "admin.canonicalDetail.slug.title": "¿Regenerar el slug público?",
    "admin.canonicalDetail.slug.warning": "El slug es la dirección pública del producto. Al cambiarlo, los enlaces ya compartidos y los resultados indexados en buscadores dejan de funcionar. No hay redirección automática.",
    "admin.canonicalDetail.slug.from": "Actual",
    "admin.canonicalDetail.slug.to": "Quedaría",
    "admin.canonicalDetail.slug.unchanged": "El slug ya coincide con el nombre actual: regenerarlo no cambiaría nada.",
    "admin.canonicalDetail.slug.confirm": "Regenerar",
    "admin.canonicalDetail.category.title": "Categoría",
    "admin.canonicalDetail.category.suggestions": "Sugerencias",
    "admin.canonicalDetail.category.suggestionsHint": "Derivadas del léxico de la taxonomía. Sin IA generativa.",
    "admin.canonicalDetail.category.noSuggestions": "Sin sugerencias para este nombre: elegí del árbol completo.",
    "admin.canonicalDetail.category.because": "por",
    "admin.canonicalDetail.category.all": "Árbol completo",
    "admin.canonicalDetail.category.showTree": "Ver árbol completo",
    "admin.canonicalDetail.category.hideTree": "Ocultar árbol",
    "admin.canonicalDetail.category.search": "Buscar categoría…",
    "admin.canonicalDetail.category.assign": "Asignar",
    "admin.canonicalDetail.category.current": "Actual",
    "admin.canonicalDetail.category.signal.lexicon": "léxico",
    "admin.canonicalProducts.bulk.actions": "Acciones",
    "admin.canonicalProducts.bulk.assignCategory": "Asignar categoría ({count})",
    "admin.canonicalProducts.bulk.selectAll": "Seleccionar todo",
    "admin.canonicalProducts.bulk.title": "Asignar categoría en lote",
    "admin.canonicalProducts.bulk.subtitle": "Se aplicará a {count} productos seleccionados.",
    "admin.canonicalProducts.bulk.heterogeneous": "Ojo: los seleccionados parecen de categorías distintas. Asignar una sola los agruparía mal.",
    "admin.canonicalProducts.bulk.withoutSignal": "{count} sin señal para sugerir: se clasificarían a ciegas.",
    "admin.canonicalProducts.bulk.supportedBy": "{count} de los seleccionados",
    "admin.canonicalProducts.bulk.apply": "Asignar",
    "admin.canonicalProducts.bulk.applying": "Asignando…",
    "admin.canonicalProducts.bulk.done": "{count} productos actualizados.",
    "admin.canonicalProducts.bulk.someFailed": "{count} no se pudieron actualizar.",
    "admin.canonicalProducts.bulk.error": "No se pudo aplicar la asignación.",
    "admin.canonicalProducts.bulk.close": "Cerrar",
    "admin.canonicalDetail.image.gallery": "Galería del canónico",
    "admin.canonicalDetail.image.position": "{n}ª imagen",
    "admin.canonicalDetail.image.primary": "Principal · la que ve el público",
    "admin.canonicalDetail.image.emptyGallery": "Este canónico todavía no tiene imágenes. Tomá una de las tiendas de abajo.",
    "admin.canonicalDetail.image.moveUp": "Subir una posición",
    "admin.canonicalDetail.image.moveDown": "Bajar una posición",
    "admin.canonicalDetail.image.remove": "Quitar de la galería",
    "admin.canonicalDetail.image.fromStore": "De {name}",
    "admin.canonicalDetail.image.manual": "URL manual",
    "admin.canonicalDetail.image.add": "Agregar",
    "admin.canonicalDetail.image.added": "Ya en la galería",
    "admin.canonicalDetail.image.candidatesHint": "Copia la URL de la tienda al canónico. No modifica el producto de la tienda.",
    "admin.canonicalDetail.image.upload": "Subir imagen",
    "admin.canonicalDetail.image.uploadSoon": "Subir desde el ordenador todavía no está disponible: falta definir dónde se guardarán los archivos. Por ahora se toman de las tiendas o se pega una URL desde Editar.",
    "admin.canonicalDetail.image.uploadSoonTitle": "Subida de imágenes: próximamente",
    "admin.canonicalDetail.image.understood": "Entendido",
    "admin.canonicalDetail.image.confirmTitle": "Esto cambia lo que ve el público",
    "admin.canonicalDetail.image.confirmRemove":
      "La imagen en posición 1 es la que ve el público en la página del producto. Al quitarla, la siguiente de la galería pasa a ocupar su lugar; si no hay otra, el producto queda sin imagen.",
    "admin.canonicalDetail.image.confirmReorder":
      "Vas a mover la imagen que ve el público en la página del producto. El cambio se publica de inmediato.",
    "admin.canonicalDetail.image.confirmRemoveAccept": "Quitar igual",
    "admin.canonicalDetail.image.confirmReorderAccept": "Mover igual",
    "admin.canonicalDetail.image.confirmCancel": "Cancelar",
    "admin.canonicalDetail.description.title": "Descripción",
    "admin.canonicalDetail.description.current": "Descripción del canónico",
    "admin.canonicalDetail.description.hint": "Es la que se publica. Elegí una de las tiendas y ajustala si hace falta.",
    "admin.canonicalDetail.description.placeholder": "Sin descripción. Tomá una de las tiendas o escribila.",
    "admin.canonicalDetail.description.candidates": "Descripciones de las tiendas",
    "admin.canonicalDetail.description.use": "Usar esta",
    "admin.canonicalDetail.description.inUse": "En uso",
    "admin.canonicalDetail.description.empty": "Ninguna tienda enlazada publica descripción.",
    "admin.canonicalDetail.description.save": "Guardar descripción",
    "admin.canonicalDetail.description.saving": "Guardando…",
    "admin.canonicalDetail.description.saved": "Descripción guardada",
    "admin.canonicalDetail.description.copyHint": "Copia el texto de la tienda al canónico. No modifica el producto de la tienda.",
    "admin.canonicalDetail.description.unsaved": "Cambios sin guardar",
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
    "admin.orchestration.col.runOutcome": "Outcome",
    "admin.orchestration.col.lastRun": "Last run",
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
    "admin.orchestration.action.detail": "View detail",
    "admin.orchestration.action.run": "Run now",
    "admin.orchestration.state.active": "Active",
    "admin.orchestration.flow.provider_prices_refresh": "Search-based discovery",
    "admin.orchestration.state.paused": "Paused",
    "admin.orchestration.action.pause": "Pause",
    "admin.orchestration.action.resume": "Resume",
    "admin.orchestration.action.cancel": "Cancel run",
    "admin.orchestration.kpi.activeFlows": "Active flows",
    "admin.orchestration.kpi.activeFlows.hint": "Active out of total configured",
    "admin.orchestration.kpi.newCanonicals": "New canonicals",
    "admin.orchestration.kpi.newCanonicals.hint": "Born from what these runs discovered",
    "admin.orchestration.col.status": "Status",
    "admin.orchestration.col.schedule": "Schedule",
    "admin.orchestration.detail.slaWithin": "Within SLA",
    "admin.orchestration.detail.slaBreached": "SLA breached",
    "admin.orchestration.detail.slaNa": "SLA N/A",
    "admin.orchestration.detail.back": "Back to the console",
    "admin.orchestration.detail.lastRunTitle": "Last run",
    "admin.orchestration.detail.trigger": "Triggered by",
    "admin.orchestration.detail.startedAt": "Started",
    "admin.orchestration.detail.endedAt": "Ended",
    "admin.orchestration.detail.duration": "Duration",
    "admin.orchestration.detail.noRun": "This flow has not run yet.",
    "admin.orchestration.detail.resultsTitle": "Run results",
    "admin.orchestration.detail.healthTitle": "Health & SLA",
    "admin.orchestration.detail.lastSync": "Last successful sync",
    "admin.orchestration.detail.queryLimit": "Effective search limit",
    "admin.orchestration.detail.queryLimitNone": "No limit",
    "admin.orchestration.detail.historyTitle": "Run history",
    "admin.orchestration.detail.historyUnavailable": "We could not reach the orchestrator's run history.",
    "admin.orchestration.detail.historyEmpty": "No runs in the history.",
    "admin.orchestration.detail.historyMore": "Load more",
    "admin.orchestration.detail.runnerDown": "We could not reach the orchestrator. The configuration below is still available; run state returns once the runner answers.",
    "admin.orchestration.detail.activityTitle": "Activity",
    "admin.orchestration.detail.activityEmpty": "This run recorded no events.",
    "admin.orchestration.detail.activityUnavailable": "We could not read this run's activity.",
    "admin.orchestration.detail.activityShowAll": "Show all",
    "admin.orchestration.detail.activityShowKey": "Show the essentials",
    "admin.orchestration.detail.activityHiddenCount": "{n} machinery events hidden",
    "admin.orchestration.detail.activityLoadMore": "Load more events",
    "admin.orchestration.detail.activityOfRun": "Run from {when}",
    "admin.orchestration.detail.activityBackToCurrent": "Back to the latest",
    "admin.orchestration.detail.rowSeeActivity": "See this run's activity",
    "admin.orchestration.detail.failureTitle": "Why it failed",
    "admin.orchestration.detail.failureTechnical": "Technical detail",
    "admin.orchestration.event.queued": "Queued",
    "admin.orchestration.event.started": "Started",
    "admin.orchestration.event.succeeded": "Finished successfully",
    "admin.orchestration.event.canceled": "Canceled",
    "admin.orchestration.event.failure": "Failed",
    "admin.orchestration.event.step": "Step",
    "admin.orchestration.event.materialization": "Produced",
    "admin.orchestration.event.log": "Log",
    "admin.orchestration.event.machinery": "System",
    "admin.orchestration.detail.colWhen": "When",
    "admin.orchestration.detail.colTrigger": "Trigger",
    "admin.orchestration.detail.colState": "State",
    "admin.orchestration.detail.colDuration": "Duration",
    "admin.orchestration.detail.durationMinutes": "{minutes}m {seconds}s",
    "admin.orchestration.detail.durationSeconds": "{seconds}s",
    "admin.orchestration.detail.durationRunning": "Running",
    "admin.orchestration.trigger.manual": "Manual",
    "admin.orchestration.trigger.automatic": "Scheduled",
    "admin.orchestration.trigger.retry": "Retry",
    "admin.orchestration.bulk.selected": "{count} selected",
    "admin.orchestration.bulk.run": "Run selected",
    "admin.orchestration.bulk.pause": "Pause selected",
    "admin.orchestration.bulk.delete": "Delete selected",
    "admin.orchestration.bulk.selectAll": "Select every flow on this page",
    "admin.orchestration.bulk.selectRow": "Select this flow",
    "admin.orchestration.bulk.deleteTitle": "Delete {count} flow(s)?",
    "admin.orchestration.bulk.deleteBody": "They stop being scheduled and leave the console. Their run history is kept: nothing that already happened is deleted.",
    "admin.orchestration.col.progress": "Progress",
    "admin.orchestration.col.progressHelp": "How far the run got. The number is the total of products the store returned; the bar, how many of the basket searches have finished.",
    "admin.orchestration.col.runFunnel": "Run outcome",
    "admin.orchestration.col.runFunnelHelp": "How the last run ended, in two levels. Top: of everything the store returned, how much we already had and how much was new. Bottom: of those NEW ones — not of the total — how many the system linked on its own and how many are waiting for a person. Hover each label for detail.",
    "admin.orchestration.funnel.existing": "Existing",
    "admin.orchestration.funnel.linked": "Linked",
    "admin.orchestration.funnel.new": "New",
    "admin.orchestration.funnel.pending": "Pending",
    "admin.orchestration.products.queryProgress": "{processed}/{total} Searches",
    "admin.orchestration.products.queryProgressTitle": "Searches run out of those planned. This is the run's REAL progress: the product count cannot tell you, because one search may return many or none.",
    "admin.orchestration.products.starting": "Starting…",
    "admin.orchestration.products.startingHint": "The run started but has not executed any search yet. The runner takes a few seconds to spin up its process.",
    "admin.orchestration.products.seenLabel": "products",
    "admin.orchestration.products.chipKnown": "{n} Already known",
    "admin.orchestration.products.chipNew": "{n} New",
    "admin.orchestration.products.seenHelp": "Everything the store returned in this run, repeats included: if the same product shows up in two different basket searches, it counts twice. This is raw volume, not distinct products.",
    "admin.orchestration.products.knownHelp": "Products we already had. Only today's price was recorded for them; they do not go through matching again. A store's first run has almost none; later runs should be mostly these.",
    "admin.orchestration.products.newHelp": "Products we did not have, which entered automatic matching. \"New\" describes where they came from, not how they ended up: the outcome is the bar below.",
    "admin.orchestration.outcome.linkedHelp": "The system decided on its own which catalog product they correspond to, confident enough not to ask anyone. No human reviewed them.",
    "admin.orchestration.outcome.queuedHelp": "Left undecided, waiting for a person in the review queue. This is not a failure: when in doubt the system would rather ask than invent a link.",
    "admin.orchestration.products.chipDiscarded": "{n} Discarded",
    "admin.orchestration.outcome.chipLinked": "{n} Linked",
    "admin.orchestration.outcome.chipQueued": "{n} Queued",
    "admin.orchestration.outcome.chipNew": "{n} New",
    "admin.orchestration.outcome.nothing": "No results yet",
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
    "admin.orchestration.tabs.flows": "Providers",
    "admin.orchestration.tabs.assets": "Dagster assets",
    "admin.orchestration.assets.loading": "Asking the orchestrator…",
    "admin.orchestration.assets.empty": "The orchestrator answered, but declares no assets.",
    "admin.orchestration.assets.unavailableTitle": "We could not reach the orchestrator",
    "admin.orchestration.assets.unavailableHint": "Assets live only in Dagster, so there is nothing to show until it answers. The policies in the Providers tab are still available.",
    "admin.orchestration.assets.partsProvider": "supermarkets",
    "admin.orchestration.assets.partsSection": "catalog sections",
    "admin.orchestration.assets.partsOther": "parts",
    "admin.orchestration.assets.partitionsHelp": "Some processes run in independent parts: one per supermarket, or one per catalog section. Each part is launched and retried on its own, so if one fails the others carry on. The number shows how many parts have finished successfully. (Dagster calls this \"materializing\".)",
    "admin.orchestration.assets.partitionsDetail": "{materialized} of {total} {noun} processed successfully.",
    "admin.orchestration.assets.partitionsNone": "This process is not split into parts: it runs as a whole, in one go.",
    "admin.orchestration.assets.colAsset": "Asset",
    "admin.orchestration.assets.colGroup": "Group",
    "admin.orchestration.assets.colJobs": "Jobs",
    "admin.orchestration.assets.colPartitions": "Partitions",
    "admin.orchestration.assets.colLastRun": "Last run",
    "admin.orchestration.assets.colHealth": "Health",
    "admin.orchestration.assets.failedCount": "({count} failed)",
    "admin.orchestration.assets.health.never_materialized": "Never run",
    "admin.orchestration.assets.health.healthy": "Healthy",
    "admin.orchestration.assets.health.degraded": "Degraded",
    "admin.orchestration.assets.health.failed": "Failed",
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
    "admin.reviewQueue.category.edit": "Change category",
    "admin.reviewQueue.category.search": "Search category...",
    "admin.reviewQueue.category.noMatch": "No category matches",
    "admin.toolbar.actions.classify": "Classify selected",
    "admin.toolbar.actions.canonize": "Approve and create canonical",
    "admin.reviewQueue.canonize.title": "Create canonicals",
    "admin.reviewQueue.canonize.description": "{n} new canonical products will be created and linked to these rows. This cannot be undone.",
    "admin.reviewQueue.canonize.confirm": "Create {n} canonicals",
    "admin.reviewQueue.canonize.missing": "{n} uncategorized — pick one for those rows",
    "admin.reviewQueue.canonize.choose": "Choose category...",
    "admin.reviewQueue.canonize.onlyFillsGaps": "Only applies to those without one. The rest keep theirs.",
    "admin.reviewQueue.canonize.done": "{n} canonicals created",
    "admin.reviewQueue.canonize.preview": "What will be created",
    "admin.reviewQueue.canonize.rowMissing": "No category",
    "admin.reviewQueue.canonize.perPage": "Per page",
    "admin.reviewQueue.canonize.prev": "Previous page",
    "admin.reviewQueue.canonize.next": "Next page",
    "admin.toolbar.actions.approve.noCandidates": "None of the selected rows has candidates. Use \"Approve and create canonical\".",
    "admin.reviewQueue.classify.done": "{n} classified",
    "admin.reviewQueue.classify.undecided": "{n} undecided",
    "admin.reviewQueue.classify.failed": "{n} failed",
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
    "admin.providers.subtitle": "Manage chains and their data sources. The logo is set by pasted URL (no file upload).",
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
    "admin.providers.add": "Add provider",
    "admin.providers.search.aria": "Search provider",
    "admin.providers.search.placeholder": "Search provider...",
    "admin.providers.emptySearch": "No provider matches the search.",
    "admin.providers.selectAll": "Select every provider on this page",
    "admin.providers.col.logo": "Logo",
    "admin.providers.col.name": "Name",
    "admin.providers.col.market": "Market",
    "admin.providers.col.type": "Type",
    "admin.providers.col.platform": "Platform",
    "admin.providers.col.status": "Status",
    "admin.providers.col.actions": "Actions",
    "admin.providers.status.active": "Active",
    "admin.providers.status.archived": "Archived",
    "admin.providers.filters.title": "Filter providers",
    "admin.providers.filters.open": "Open filters",
    "admin.providers.filters.type": "Type",
    "admin.providers.filters.platform": "Platform",
    "admin.providers.filters.status": "Status",
    "admin.providers.filters.all": "All",
    "admin.providers.filters.onlyActive": "Active only",
    "admin.providers.filters.onlyArchived": "Archived only",
    "admin.providers.actions.aria": "Actions for {name}",
    "admin.providers.actions.edit": "Edit",
    "admin.providers.actions.archive": "Archive",
    "admin.providers.actions.unarchive": "Restore",
    "admin.providers.actions.errArchive": "Could not change the provider status.",
    "admin.providers.modal.editTitle": "Edit {name}",
    "admin.providers.modal.cancel": "Cancel",
    "admin.providers.modal.save": "Save changes",
    "admin.providers.modal.saving": "Saving...",
    "admin.providers.archive.title": "Archive {name}?",
    "admin.providers.archive.description": "It stops showing in the console and in ingestion. Its price history, products and configuration stay intact, and you can restore it at any time.",
    "admin.providers.archive.confirm": "Archive provider",
    "admin.providers.pagination.show": "Show",
    "admin.providers.pagination.perPage": "per page",
    "admin.providers.pagination.of": "{from}-{to} of {total}",
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
    "admin.canonicalProducts.title": "Canonical Products (Save)",
    "admin.canonicalProducts.subtitle": "Canonical catalog: what exists, how many stores it is linked to, and what it needs to be complete.",
    "admin.canonicalProducts.search.aria": "Search canonical products",
    "admin.canonicalProducts.search.placeholder": "Search by name, brand or slug…",
    "admin.canonicalProducts.empty": "No canonical products yet.",
    "admin.canonicalProducts.emptySearch": "No product matches that search.",
    "admin.canonicalProducts.add": "Add canonical",
    "admin.canonicalProducts.import": "Import",
    "admin.canonicalProducts.filters.button": "Filters",
    "admin.canonicalProducts.filters.title": "Filter catalog",
    "admin.canonicalProducts.filters.clear": "Clear",
    "admin.canonicalProducts.filters.apply": "Apply",
    "admin.canonicalProducts.filters.quality": "Status",
    "admin.canonicalProducts.filters.ean": "EAN",
    "admin.canonicalProducts.filters.minProviders": "Minimum coverage",
    "admin.canonicalProducts.filters.minProvidersHint": "Only canonicals linked to at least this many stores.",
    "admin.canonicalProducts.filters.updatedSince": "Price seen since",
    "admin.canonicalProducts.filters.all": "All",
    "admin.canonicalProducts.filters.eanYes": "With EAN",
    "admin.canonicalProducts.filters.eanNo": "Without EAN",
    "admin.canonicalProducts.col.image": "Image",
    "admin.canonicalProducts.col.product": "Product",
    "admin.canonicalProducts.col.brand": "Brand",
    "admin.canonicalProducts.col.size": "Size",
    "admin.canonicalProducts.col.weight": "Weight",
    "admin.canonicalProducts.col.price": "Price",
    "admin.canonicalProducts.noImage": "No image",
    "admin.canonicalProducts.col.measure": "Unit",
    "admin.canonicalProducts.col.category": "Category",
    "admin.canonicalProducts.col.providers": "Stores",
    "admin.canonicalProducts.col.completeness": "Completeness",
    "admin.canonicalProducts.col.quality": "Status",
    "admin.canonicalProducts.col.lastPrice": "Last price",
    "admin.canonicalProducts.col.actions": "Actions",
    "admin.canonicalProducts.measure.mass": "Mass",
    "admin.canonicalProducts.measure.volume": "Volume",
    "admin.canonicalProducts.measure.count": "Count",
    "admin.canonicalProducts.status.complete": "Complete",
    "admin.canonicalProducts.status.no_image": "No image",
    "admin.canonicalProducts.status.no_category": "No category",
    "admin.canonicalProducts.status.no_providers": "No stores",
    "admin.canonicalProducts.status.stale_price": "Stale price",
    "admin.canonicalProducts.status.possible_duplicate": "Possible duplicate",
    "admin.canonicalProducts.statusHint.complete": "Nothing missing: it has an image, a category, quality, linked stores and a fresh price.",
    "admin.canonicalProducts.statusHint.no_image": "Missing image. It can be taken from a linked store in the detail view.",
    "admin.canonicalProducts.statusHint.no_category": "No category assigned: it does not show up in the public navigation tree.",
    "admin.canonicalProducts.statusHint.no_providers": "No store is linked to this canonical, so there is no price to compare.",
    "admin.canonicalProducts.statusHint.stale_price": "No run has refreshed this product's price in over a week.",
    "admin.canonicalProducts.statusHint.possible_duplicate": "Another canonical shares an EAN or brand and size with this one. Review it before it pollutes comparisons.",
    "admin.canonicalProducts.ean.reachable": "EAN-reachable",
    "admin.canonicalProducts.ean.reachableHint": "At least one linked store carries an EAN: barcode matching can cover it.",
    "admin.canonicalProducts.actions.menuLabel": "Product actions",
    "admin.canonicalProducts.actions.view": "View detail",
    "admin.canonicalProducts.actions.edit": "Edit",
    "admin.canonicalProducts.actions.providers": "View providers",
    "admin.canonicalProducts.actions.public": "View public page",
    "admin.canonicalProducts.actions.archive": "Archive",
    "admin.canonicalProducts.actions.archiveBlocked": "Archiving is not available yet: it requires a model migration (archived_at).",
    "admin.canonicalProducts.pagination.show": "Show",
    "admin.canonicalProducts.pagination.perPage": "per page",
    "admin.canonicalProducts.pagination.of": "{from}–{to} of {total}",
    "admin.canonicalProducts.providers.title": "Matched providers",
    "admin.canonicalProducts.providers.col.provider": "Store",
    "admin.canonicalProducts.providers.col.price": "Price",
    "admin.canonicalProducts.providers.col.lastSeen": "Updated",
    "admin.canonicalProducts.providers.col.action": "Online store",
    "admin.canonicalProducts.providers.cheapest": "Best price",
    "admin.canonicalProducts.providers.open": "Open",
    "admin.canonicalProducts.providers.empty": "No store is linked to this product.",
    "admin.canonicalProducts.providers.loading": "Loading…",
    "admin.canonicalProducts.form.name": "Name",
    "admin.canonicalProducts.form.brand": "Brand",
    "admin.canonicalProducts.form.brandHint": "Stored in UPPERCASE so variants of the same brand do not coexist.",
    "admin.canonicalProducts.form.amount": "Amount",
    "admin.canonicalProducts.form.measure": "Unit",
    "admin.canonicalProducts.form.displaySize": "Package size",
    "admin.canonicalProducts.form.quality": "Quality",
    "admin.canonicalProducts.form.imageUrl": "Image URL",
    "admin.canonicalProducts.form.cancel": "Cancel",
    "admin.canonicalProducts.create.title": "Add canonical product",
    "admin.canonicalProducts.create.subtitle": "It starts with no linked stores. The public slug is generated once and never changes.",
    "admin.canonicalProducts.create.submit": "Create product",
    "admin.canonicalProducts.create.submitting": "Creating…",
    "admin.canonicalProducts.create.error": "Could not create the product.",
    "admin.canonicalProducts.edit.title": "Edit canonical product",
    "admin.canonicalProducts.edit.subtitle": "The public slug does NOT change when editing: it is the product's address and breaking it would break shared links.",
    "admin.canonicalProducts.edit.submit": "Save changes",
    "admin.canonicalProducts.edit.submitting": "Saving…",
    "admin.canonicalProducts.edit.error": "Could not save the changes.",
    "admin.canonicalProducts.import.title": "Import canonicals",
    "admin.canonicalProducts.import.subtitle": "Paste the CSV, review what will happen, and only then confirm.",
    "admin.canonicalProducts.import.step1": "1. Paste",
    "admin.canonicalProducts.import.step2": "2. Preview",
    "admin.canonicalProducts.import.step3": "3. Confirm",
    "admin.canonicalProducts.import.columns": "Columns: name, brand, size_amount, size_measure, display_size, quality, image_url",
    "admin.canonicalProducts.import.placeholder": "name,brand,size_amount,size_measure\nWhite Rice,GOYA,5,mass",
    "admin.canonicalProducts.import.preview": "Preview",
    "admin.canonicalProducts.import.back": "Back",
    "admin.canonicalProducts.import.confirm": "Import {count}",
    "admin.canonicalProducts.import.confirming": "Importing…",
    "admin.canonicalProducts.import.valid": "{count} ready to import",
    "admin.canonicalProducts.import.invalid": "{count} with errors",
    "admin.canonicalProducts.import.warnings": "{count} warnings",
    "admin.canonicalProducts.import.noValidRows": "No row in the file is valid. Fix the errors and preview again.",
    "admin.canonicalProducts.import.row": "Row {n}",
    "admin.canonicalProducts.import.done": "{count} products were imported.",
    "admin.canonicalProducts.import.close": "Close",
    "admin.canonicalProducts.import.error": "Could not process the import.",
    "admin.canonicalProducts.actions.unarchive": "Restore",
    "admin.canonicalProducts.archive.title": "Archive this canonical product?",
    "admin.canonicalProducts.archive.impact": "It will stop appearing on the public site, in comparisons and in category rails. Nothing is deleted: price history, linked stores and the public link are preserved, and you can restore it at any time.",
    "admin.canonicalProducts.archive.confirm": "Archive",
    "admin.canonicalProducts.archive.cancel": "Cancel",
    "admin.canonicalProducts.archive.badge": "Archived",
    "admin.canonicalProducts.filters.includeArchived": "Show archived",
    "admin.canonicalProducts.form.description": "Description",
    "admin.nav.save.canonicalProducts": "Canonical products",
    "admin.canonicalDetail.back": "Back to catalog",
    "admin.canonicalDetail.notFound": "This canonical product does not exist.",
    "admin.canonicalDetail.section.info": "Canonical information",
    "admin.canonicalDetail.section.providers": "Matched providers",
    "admin.canonicalDetail.section.history": "History and KPIs",
    "admin.canonicalDetail.section.evidence": "Evidence",
    "admin.canonicalDetail.section.duplicates": "Possible duplicates",
    "admin.canonicalDetail.section.activity": "Activity and notes",
    "admin.canonicalDetail.info.slug": "Public slug",
    "admin.canonicalDetail.info.size": "Size",
    "admin.canonicalDetail.info.quality": "Quality",
    "admin.canonicalDetail.info.category": "Category",
    "admin.canonicalDetail.info.description": "Description",
    "admin.canonicalDetail.info.created": "Created",
    "admin.canonicalDetail.info.originRun": "Discovered in run",
    "admin.canonicalDetail.info.originRunNone": "Manual entry or predates orchestration",
    "admin.canonicalDetail.info.lastMatch": "Last match",
    "admin.canonicalDetail.info.lastPrice": "Last price seen",
    "admin.canonicalDetail.info.empty": "—",
    "admin.canonicalDetail.kpi.min": "Lowest price",
    "admin.canonicalDetail.kpi.max": "Highest price",
    "admin.canonicalDetail.kpi.spread": "Spread",
    "admin.canonicalDetail.kpi.providers": "Active stores",
    "admin.canonicalDetail.kpi.change": "Range variation",
    "admin.canonicalDetail.kpi.changes": "Price changes",
    "admin.canonicalDetail.kpi.updated": "Updated",
    "admin.canonicalDetail.kpi.noData": "Not enough history to compute KPIs.",
    "admin.canonicalDetail.range.15d": "15 days",
    "admin.canonicalDetail.range.1m": "1 month",
    "admin.canonicalDetail.range.3m": "3 months",
    "admin.canonicalDetail.range.6m": "6 months",
    "admin.canonicalDetail.range.1y": "1 year",
    "admin.canonicalDetail.range.all": "All",
    "admin.canonicalDetail.chart.empty": "There is no price history for this product yet.",
    "admin.canonicalDetail.chart.carryIn": "The first point of each line is the price already in effect when the range began.",
    "admin.canonicalDetail.evidence.col.provider": "Store",
    "admin.canonicalDetail.evidence.col.raw": "Name in store",
    "admin.canonicalDetail.evidence.col.ean": "EAN / SKU",
    "admin.canonicalDetail.evidence.col.method": "How it was linked",
    "admin.canonicalDetail.evidence.col.confidence": "Confidence",
    "admin.canonicalDetail.evidence.empty": "No store is linked to this canonical.",
    "admin.canonicalDetail.evidence.human": "Decided by a person",
    "admin.canonicalDetail.evidence.auto": "Automatic link",
    "admin.canonicalDetail.duplicates.empty": "No possible duplicates detected.",
    "admin.canonicalDetail.duplicates.eanCollision": "Same EAN",
    "admin.canonicalDetail.duplicates.eanCollisionHint": "Another canonical shares a barcode with this one: the strongest signal that they are the same product.",
    "admin.canonicalDetail.duplicates.sameBrandSize": "Same brand and size",
    "admin.canonicalDetail.duplicates.readOnly": "Alert only: merging or splitting canonicals is not available yet.",
    "admin.canonicalDetail.activity.empty": "Nobody has modified this canonical yet.",
    "admin.canonicalDetail.note.title": "Internal note",
    "admin.canonicalDetail.note.hint": "Admin-only. It never appears on the public page.",
    "admin.canonicalDetail.note.placeholder": "Team coordination about this product…",
    "admin.canonicalDetail.note.save": "Save note",
    "admin.canonicalDetail.note.saving": "Saving…",
    "admin.canonicalDetail.note.saved": "Note saved",
    "admin.canonicalDetail.action.audit": "Activity",
    "admin.canonicalDetail.chart.loading": "Loading history…",
    "admin.canonicalDetail.chart.error": "Could not load the price history. Try again in a moment.",
    "admin.canonicalDetail.section.image": "Product image",
    "admin.canonicalDetail.image.current": "Current image",
    "admin.canonicalDetail.image.candidates": "Take from a store",
    "admin.canonicalDetail.image.empty": "No linked store has an image. You can paste a URL from Edit.",
    "admin.canonicalDetail.image.none": "No image",
    "admin.canonicalDetail.image.use": "Use this",
    "admin.canonicalDetail.image.inUse": "In use",
    "admin.canonicalDetail.image.hint": "Copies the store URL onto the canonical. It does not modify the store product.",
    "admin.canonicalDetail.image.uploadBlocked": "Uploading an image from your computer requires deciding on file storage.",
    "admin.canonicalDetail.activity.by": "by",
    "admin.canonicalDetail.activity.action.create": "Manual creation",
    "admin.canonicalDetail.activity.action.import": "Bulk import",
    "admin.canonicalDetail.activity.action.update": "Edit",
    "admin.canonicalDetail.activity.action.archive": "Archived",
    "admin.canonicalDetail.activity.action.unarchive": "Restored",
    "admin.canonicalDetail.activity.action.note": "Internal note",
    "admin.canonicalDetail.activity.action.addImage": "Image added",
    "admin.canonicalDetail.activity.action.removeImage": "Image removed",
    "admin.canonicalDetail.activity.action.reorderImages": "Images reordered",
    "admin.canonicalDetail.activity.action.setCategory": "Category assigned",
    "admin.canonicalDetail.activity.action.regenerateSlug": "Slug regenerated",
    "admin.canonicalDetail.activity.action.unknown": "Product change",
    "admin.canonicalDetail.chart.retry": "Try again",
    "admin.canonicalDetail.activity.fields": "Fields:",
    "admin.canonicalDetail.slug.action": "Regenerate slug",
    "admin.canonicalDetail.slug.title": "Regenerate the public slug?",
    "admin.canonicalDetail.slug.warning": "The slug is the product's public address. Changing it breaks already-shared links and indexed search results. There is no automatic redirect.",
    "admin.canonicalDetail.slug.from": "Current",
    "admin.canonicalDetail.slug.to": "Would become",
    "admin.canonicalDetail.slug.unchanged": "The slug already matches the current name: regenerating would change nothing.",
    "admin.canonicalDetail.slug.confirm": "Regenerate",
    "admin.canonicalDetail.category.title": "Category",
    "admin.canonicalDetail.category.suggestions": "Suggestions",
    "admin.canonicalDetail.category.suggestionsHint": "Derived from the taxonomy lexicon. No generative AI.",
    "admin.canonicalDetail.category.noSuggestions": "No suggestions for this name: pick from the full tree.",
    "admin.canonicalDetail.category.because": "because of",
    "admin.canonicalDetail.category.all": "Full tree",
    "admin.canonicalDetail.category.showTree": "Browse full tree",
    "admin.canonicalDetail.category.hideTree": "Hide tree",
    "admin.canonicalDetail.category.search": "Search category…",
    "admin.canonicalDetail.category.assign": "Assign",
    "admin.canonicalDetail.category.current": "Current",
    "admin.canonicalDetail.category.signal.lexicon": "lexicon",
    "admin.canonicalProducts.bulk.actions": "Actions",
    "admin.canonicalProducts.bulk.assignCategory": "Assign category ({count})",
    "admin.canonicalProducts.bulk.selectAll": "Select all",
    "admin.canonicalProducts.bulk.title": "Assign category in bulk",
    "admin.canonicalProducts.bulk.subtitle": "It will apply to {count} selected products.",
    "admin.canonicalProducts.bulk.heterogeneous": "Careful: the selected products look like they belong to different categories. Assigning a single one would group them wrong.",
    "admin.canonicalProducts.bulk.withoutSignal": "{count} without a signal to suggest from: they would be classified blindly.",
    "admin.canonicalProducts.bulk.supportedBy": "{count} of the selected",
    "admin.canonicalProducts.bulk.apply": "Assign",
    "admin.canonicalProducts.bulk.applying": "Assigning…",
    "admin.canonicalProducts.bulk.done": "{count} products updated.",
    "admin.canonicalProducts.bulk.someFailed": "{count} could not be updated.",
    "admin.canonicalProducts.bulk.error": "Could not apply the assignment.",
    "admin.canonicalProducts.bulk.close": "Close",
    "admin.canonicalDetail.image.gallery": "Canonical gallery",
    "admin.canonicalDetail.image.position": "Image {n}",
    "admin.canonicalDetail.image.primary": "Primary · what the public sees",
    "admin.canonicalDetail.image.emptyGallery": "This canonical has no images yet. Take one from the stores below.",
    "admin.canonicalDetail.image.moveUp": "Move up one position",
    "admin.canonicalDetail.image.moveDown": "Move down one position",
    "admin.canonicalDetail.image.remove": "Remove from gallery",
    "admin.canonicalDetail.image.fromStore": "From {name}",
    "admin.canonicalDetail.image.manual": "Manual URL",
    "admin.canonicalDetail.image.add": "Add",
    "admin.canonicalDetail.image.added": "Already in the gallery",
    "admin.canonicalDetail.image.candidatesHint": "Copies the store URL onto the canonical. It does not modify the store product.",
    "admin.canonicalDetail.image.upload": "Upload image",
    "admin.canonicalDetail.image.uploadSoon": "Uploading from your computer is not available yet: we still need to decide where files will be stored. For now, take them from the stores or paste a URL from Edit.",
    "admin.canonicalDetail.image.uploadSoonTitle": "Image upload: coming soon",
    "admin.canonicalDetail.image.understood": "Got it",
    "admin.canonicalDetail.image.confirmTitle": "This changes what the public sees",
    "admin.canonicalDetail.image.confirmRemove":
      "The image in position 1 is the one shoppers see on the product page. Removing it promotes the next image in the gallery; if there is none, the product is left without an image.",
    "admin.canonicalDetail.image.confirmReorder":
      "You are moving the image shoppers see on the product page. The change is published immediately.",
    "admin.canonicalDetail.image.confirmRemoveAccept": "Remove anyway",
    "admin.canonicalDetail.image.confirmReorderAccept": "Move anyway",
    "admin.canonicalDetail.image.confirmCancel": "Cancel",
    "admin.canonicalDetail.description.title": "Description",
    "admin.canonicalDetail.description.current": "Canonical description",
    "admin.canonicalDetail.description.hint": "This is what gets published. Pick one from the stores and adjust it if needed.",
    "admin.canonicalDetail.description.placeholder": "No description. Take one from the stores or write it.",
    "admin.canonicalDetail.description.candidates": "Store descriptions",
    "admin.canonicalDetail.description.use": "Use this",
    "admin.canonicalDetail.description.inUse": "In use",
    "admin.canonicalDetail.description.empty": "No linked store publishes a description.",
    "admin.canonicalDetail.description.save": "Save description",
    "admin.canonicalDetail.description.saving": "Saving…",
    "admin.canonicalDetail.description.saved": "Description saved",
    "admin.canonicalDetail.description.copyHint": "Copies the store text onto the canonical. It does not modify the store product.",
    "admin.canonicalDetail.description.unsaved": "Unsaved changes",
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
    "admin.orchestration.col.runOutcome": "Desfecho",
    "admin.orchestration.col.lastRun": "Última execução",
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
    "admin.orchestration.action.detail": "Ver detalhe",
    "admin.orchestration.action.run": "Executar agora",
    "admin.orchestration.state.active": "Ativo",
    "admin.orchestration.flow.provider_prices_refresh": "Descoberta por busca",
    "admin.orchestration.state.paused": "Pausado",
    "admin.orchestration.action.pause": "Pausar",
    "admin.orchestration.action.resume": "Ativar",
    "admin.orchestration.action.cancel": "Cancelar execução",
    "admin.orchestration.kpi.activeFlows": "Fluxos ativos",
    "admin.orchestration.kpi.activeFlows.hint": "Ativos sobre o total configurado",
    "admin.orchestration.kpi.newCanonicals": "Canônicos novos",
    "admin.orchestration.kpi.newCanonicals.hint": "Nasceram do que estas execuções descobriram",
    "admin.orchestration.col.status": "Estado",
    "admin.orchestration.col.schedule": "Horário",
    "admin.orchestration.detail.slaWithin": "Dentro do SLA",
    "admin.orchestration.detail.slaBreached": "Fora do SLA",
    "admin.orchestration.detail.slaNa": "SLA N/A",
    "admin.orchestration.detail.back": "Voltar ao console",
    "admin.orchestration.detail.lastRunTitle": "Última corrida",
    "admin.orchestration.detail.trigger": "Disparada por",
    "admin.orchestration.detail.startedAt": "Início",
    "admin.orchestration.detail.endedAt": "Fim",
    "admin.orchestration.detail.duration": "Duração",
    "admin.orchestration.detail.noRun": "Este fluxo ainda não teve nenhuma corrida.",
    "admin.orchestration.detail.resultsTitle": "Resultados da corrida",
    "admin.orchestration.detail.healthTitle": "Saúde e SLA",
    "admin.orchestration.detail.lastSync": "Última sincronização bem-sucedida",
    "admin.orchestration.detail.queryLimit": "Limite de buscas efetivo",
    "admin.orchestration.detail.queryLimitNone": "Sem limite",
    "admin.orchestration.detail.historyTitle": "Histórico de corridas",
    "admin.orchestration.detail.historyUnavailable": "Não foi possível consultar o histórico do orquestrador.",
    "admin.orchestration.detail.historyEmpty": "Sem corridas no histórico.",
    "admin.orchestration.detail.historyMore": "Carregar mais",
    "admin.orchestration.detail.runnerDown": "Não foi possível consultar o orquestrador. A configuração abaixo continua disponível; o estado das corridas volta quando o runner responder.",
    "admin.orchestration.detail.activityTitle": "Atividade",
    "admin.orchestration.detail.activityEmpty": "Esta corrida não registrou eventos.",
    "admin.orchestration.detail.activityUnavailable": "Não conseguimos ler a atividade desta corrida.",
    "admin.orchestration.detail.activityShowAll": "Ver tudo",
    "admin.orchestration.detail.activityShowKey": "Ver o essencial",
    "admin.orchestration.detail.activityHiddenCount": "{n} de maquinaria oculta",
    "admin.orchestration.detail.activityLoadMore": "Carregar mais eventos",
    "admin.orchestration.detail.activityOfRun": "Corrida de {when}",
    "admin.orchestration.detail.activityBackToCurrent": "Voltar à última",
    "admin.orchestration.detail.rowSeeActivity": "Ver a atividade desta corrida",
    "admin.orchestration.detail.failureTitle": "Por que falhou",
    "admin.orchestration.detail.failureTechnical": "Detalhe técnico",
    "admin.orchestration.event.queued": "Na fila",
    "admin.orchestration.event.started": "Começou",
    "admin.orchestration.event.succeeded": "Terminou bem",
    "admin.orchestration.event.canceled": "Cancelada",
    "admin.orchestration.event.failure": "Falhou",
    "admin.orchestration.event.step": "Passo",
    "admin.orchestration.event.materialization": "Produziu",
    "admin.orchestration.event.log": "Registro",
    "admin.orchestration.event.machinery": "Sistema",
    "admin.orchestration.detail.colWhen": "Quando",
    "admin.orchestration.detail.colTrigger": "Disparo",
    "admin.orchestration.detail.colState": "Estado",
    "admin.orchestration.detail.colDuration": "Duração",
    "admin.orchestration.detail.durationMinutes": "{minutes}m {seconds}s",
    "admin.orchestration.detail.durationSeconds": "{seconds}s",
    "admin.orchestration.detail.durationRunning": "Em curso",
    "admin.orchestration.trigger.manual": "Manual",
    "admin.orchestration.trigger.automatic": "Programada",
    "admin.orchestration.trigger.retry": "Nova tentativa",
    "admin.orchestration.bulk.selected": "{count} selecionado(s)",
    "admin.orchestration.bulk.run": "Executar selecionados",
    "admin.orchestration.bulk.pause": "Pausar selecionados",
    "admin.orchestration.bulk.delete": "Excluir selecionados",
    "admin.orchestration.bulk.selectAll": "Selecionar todos os fluxos da página",
    "admin.orchestration.bulk.selectRow": "Selecionar este fluxo",
    "admin.orchestration.bulk.deleteTitle": "Excluir {count} fluxo(s)?",
    "admin.orchestration.bulk.deleteBody": "Deixam de ser programados e saem do console. O histórico das corridas é mantido: nada do que já ocorreu é apagado.",
    "admin.orchestration.col.progress": "Progresso",
    "admin.orchestration.col.progressHelp": "Quanto a execução avançou. O número é o total de produtos que a loja devolveu; a barra, quantas das buscas da cesta já terminaram.",
    "admin.orchestration.col.runFunnel": "Resultado da execução",
    "admin.orchestration.col.runFunnelHelp": "Como terminou a última execução, em dois níveis. Em cima: de tudo o que a loja devolveu, quanto já tínhamos e quanto era novo. Embaixo: desses NOVOS — não do total — quantos o sistema conseguiu vincular sozinho e quantos ficaram esperando uma pessoa. Passe o cursor em cada etiqueta para o detalhe.",
    "admin.orchestration.funnel.existing": "Existentes",
    "admin.orchestration.funnel.linked": "Vinculados",
    "admin.orchestration.funnel.new": "Novos",
    "admin.orchestration.funnel.pending": "Pendentes",
    "admin.orchestration.products.queryProgress": "{processed}/{total} Buscas",
    "admin.orchestration.products.queryProgressTitle": "Buscas executadas sobre as planejadas. É o progresso REAL da corrida: o número de produtos não diz, porque uma busca pode devolver muitos ou nenhum.",
    "admin.orchestration.products.starting": "Iniciando…",
    "admin.orchestration.products.startingHint": "A corrida começou mas ainda não executou nenhuma busca. O runner leva alguns segundos para subir o processo.",
    "admin.orchestration.products.seenLabel": "produtos",
    "admin.orchestration.products.chipKnown": "{n} Já conhecidos",
    "admin.orchestration.products.chipNew": "{n} Novos",
    "admin.orchestration.products.seenHelp": "Tudo o que a loja devolveu nesta execução, incluindo repetições: se o mesmo produto aparece em duas buscas diferentes da cesta, conta duas vezes. É volume bruto, não produtos distintos.",
    "admin.orchestration.products.knownHelp": "Produtos que já tínhamos na base. Só foi registrado o preço de hoje: não passam de novo pelo emparelhamento. Na primeira execução de uma loja quase não há; nas seguintes devem ser a maioria.",
    "admin.orchestration.products.newHelp": "Produtos que não tínhamos e entraram no emparelhamento automático. «Novo» descreve de onde vêm, não como terminaram: o desfecho é a barra de baixo.",
    "admin.orchestration.outcome.linkedHelp": "O sistema decidiu sozinho a que produto do catálogo correspondem, com confiança suficiente para não consultar ninguém. Ninguém os revisou à mão.",
    "admin.orchestration.outcome.queuedHelp": "Ficaram sem decisão e esperam uma pessoa na Fila de revisão. Não é um erro: na dúvida o sistema prefere perguntar em vez de inventar um vínculo.",
    "admin.orchestration.products.chipDiscarded": "{n} Descartados",
    "admin.orchestration.outcome.chipLinked": "{n} Vinculados",
    "admin.orchestration.outcome.chipQueued": "{n} Na fila",
    "admin.orchestration.outcome.chipNew": "{n} Novos",
    "admin.orchestration.outcome.nothing": "Sem resultados ainda",
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
    "admin.orchestration.tabs.flows": "Fornecedores",
    "admin.orchestration.tabs.assets": "Assets Dagster",
    "admin.orchestration.assets.loading": "Consultando o orquestrador…",
    "admin.orchestration.assets.empty": "O orquestrador respondeu, mas não declara nenhum asset.",
    "admin.orchestration.assets.unavailableTitle": "Não foi possível consultar o orquestrador",
    "admin.orchestration.assets.unavailableHint": "Os assets vivem apenas no Dagster, portanto não há o que mostrar até que ele responda. As políticas da aba Fornecedores continuam disponíveis.",
    "admin.orchestration.assets.partsProvider": "supermercados",
    "admin.orchestration.assets.partsSection": "seções do catálogo",
    "admin.orchestration.assets.partsOther": "partes",
    "admin.orchestration.assets.partitionsHelp": "Alguns processos são executados em partes independentes: uma por supermercado, ou uma por seção do catálogo. Cada parte é lançada e repetida sozinha, então se uma falha as demais continuam. O número indica quantas partes já terminaram bem. (No Dagster isso se chama «materializar».)",
    "admin.orchestration.assets.partitionsDetail": "{materialized} de {total} {noun} já foram processados bem.",
    "admin.orchestration.assets.partitionsNone": "Este processo não se divide em partes: é executado inteiro, de uma só vez.",
    "admin.orchestration.assets.colAsset": "Asset",
    "admin.orchestration.assets.colGroup": "Grupo",
    "admin.orchestration.assets.colJobs": "Jobs",
    "admin.orchestration.assets.colPartitions": "Partições",
    "admin.orchestration.assets.colLastRun": "Última execução",
    "admin.orchestration.assets.colHealth": "Estado",
    "admin.orchestration.assets.failedCount": "({count} com falha)",
    "admin.orchestration.assets.health.never_materialized": "Nunca executado",
    "admin.orchestration.assets.health.healthy": "Saudável",
    "admin.orchestration.assets.health.degraded": "Degradado",
    "admin.orchestration.assets.health.failed": "Com falha",
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
    "admin.reviewQueue.category.edit": "Alterar categoria",
    "admin.reviewQueue.category.search": "Buscar categoria...",
    "admin.reviewQueue.category.noMatch": "Nenhuma categoria corresponde",
    "admin.toolbar.actions.classify": "Classificar selecionados",
    "admin.toolbar.actions.canonize": "Aprovar e criar canônico",
    "admin.reviewQueue.canonize.title": "Criar canônicos",
    "admin.reviewQueue.canonize.description": "Serão criados {n} produtos canônicos novos e vinculados a estas linhas. Não pode ser desfeito.",
    "admin.reviewQueue.canonize.confirm": "Criar {n} canônicos",
    "admin.reviewQueue.canonize.missing": "{n} sem categoria — escolha uma para essas linhas",
    "admin.reviewQueue.canonize.choose": "Escolher categoria...",
    "admin.reviewQueue.canonize.onlyFillsGaps": "Só se aplica às que não têm. As demais mantêm a sua.",
    "admin.reviewQueue.canonize.done": "{n} canônicos criados",
    "admin.reviewQueue.canonize.preview": "O que será criado",
    "admin.reviewQueue.canonize.rowMissing": "Falta categoria",
    "admin.reviewQueue.canonize.perPage": "Por página",
    "admin.reviewQueue.canonize.prev": "Página anterior",
    "admin.reviewQueue.canonize.next": "Próxima página",
    "admin.toolbar.actions.approve.noCandidates": "Nenhuma das linhas selecionadas tem candidatos. Use \"Aprovar e criar canônico\".",
    "admin.reviewQueue.classify.done": "{n} classificadas",
    "admin.reviewQueue.classify.undecided": "{n} sem decidir",
    "admin.reviewQueue.classify.failed": "{n} com erro",
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
    "admin.providers.subtitle": "Gestão de redes e suas fontes de dados. O logo é definido por URL colada (sem upload de arquivos).",
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
    "admin.providers.add": "Adicionar fornecedor",
    "admin.providers.search.aria": "Buscar fornecedor",
    "admin.providers.search.placeholder": "Buscar fornecedor...",
    "admin.providers.emptySearch": "Nenhum fornecedor corresponde à busca.",
    "admin.providers.selectAll": "Selecionar todos os fornecedores da página",
    "admin.providers.col.logo": "Logo",
    "admin.providers.col.name": "Nome",
    "admin.providers.col.market": "Mercado",
    "admin.providers.col.type": "Tipo",
    "admin.providers.col.platform": "Plataforma",
    "admin.providers.col.status": "Estado",
    "admin.providers.col.actions": "Ações",
    "admin.providers.status.active": "Ativo",
    "admin.providers.status.archived": "Arquivado",
    "admin.providers.filters.title": "Filtrar fornecedores",
    "admin.providers.filters.open": "Abrir filtros",
    "admin.providers.filters.type": "Tipo",
    "admin.providers.filters.platform": "Plataforma",
    "admin.providers.filters.status": "Estado",
    "admin.providers.filters.all": "Todos",
    "admin.providers.filters.onlyActive": "Somente ativos",
    "admin.providers.filters.onlyArchived": "Somente arquivados",
    "admin.providers.actions.aria": "Ações de {name}",
    "admin.providers.actions.edit": "Editar",
    "admin.providers.actions.archive": "Arquivar",
    "admin.providers.actions.unarchive": "Restaurar",
    "admin.providers.actions.errArchive": "Não foi possível alterar o estado do fornecedor.",
    "admin.providers.modal.editTitle": "Editar {name}",
    "admin.providers.modal.cancel": "Cancelar",
    "admin.providers.modal.save": "Salvar alterações",
    "admin.providers.modal.saving": "Salvando...",
    "admin.providers.archive.title": "Arquivar {name}?",
    "admin.providers.archive.description": "Deixa de aparecer no console e na ingestão. Seu histórico de preços, produtos e configuração ficam intactos, e você pode restaurá-lo quando quiser.",
    "admin.providers.archive.confirm": "Arquivar fornecedor",
    "admin.providers.pagination.show": "Mostrar",
    "admin.providers.pagination.perPage": "por página",
    "admin.providers.pagination.of": "{from}-{to} de {total}",
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
    "admin.canonicalProducts.title": "Produtos Canônicos (Save)",
    "admin.canonicalProducts.subtitle": "Catálogo canônico: o que existe, com quantas lojas está vinculado e o que falta para estar completo.",
    "admin.canonicalProducts.search.aria": "Buscar produtos canônicos",
    "admin.canonicalProducts.search.placeholder": "Buscar por nome, marca ou slug…",
    "admin.canonicalProducts.empty": "Ainda não há produtos canônicos.",
    "admin.canonicalProducts.emptySearch": "Nenhum produto corresponde a essa busca.",
    "admin.canonicalProducts.add": "Adicionar canônico",
    "admin.canonicalProducts.import": "Importar",
    "admin.canonicalProducts.filters.button": "Filtros",
    "admin.canonicalProducts.filters.title": "Filtrar catálogo",
    "admin.canonicalProducts.filters.clear": "Limpar",
    "admin.canonicalProducts.filters.apply": "Aplicar",
    "admin.canonicalProducts.filters.quality": "Estado",
    "admin.canonicalProducts.filters.ean": "EAN",
    "admin.canonicalProducts.filters.minProviders": "Cobertura mínima",
    "admin.canonicalProducts.filters.minProvidersHint": "Somente canônicos vinculados a pelo menos esta quantidade de lojas.",
    "admin.canonicalProducts.filters.updatedSince": "Preço visto desde",
    "admin.canonicalProducts.filters.all": "Todos",
    "admin.canonicalProducts.filters.eanYes": "Com EAN",
    "admin.canonicalProducts.filters.eanNo": "Sem EAN",
    "admin.canonicalProducts.col.image": "Imagem",
    "admin.canonicalProducts.col.product": "Produto",
    "admin.canonicalProducts.col.brand": "Marca",
    "admin.canonicalProducts.col.size": "Tamanho",
    "admin.canonicalProducts.col.weight": "Peso",
    "admin.canonicalProducts.col.price": "Preço",
    "admin.canonicalProducts.noImage": "Sem imagem",
    "admin.canonicalProducts.col.measure": "Unidade",
    "admin.canonicalProducts.col.category": "Categoria",
    "admin.canonicalProducts.col.providers": "Lojas",
    "admin.canonicalProducts.col.completeness": "Completude",
    "admin.canonicalProducts.col.quality": "Estado",
    "admin.canonicalProducts.col.lastPrice": "Último preço",
    "admin.canonicalProducts.col.actions": "Ações",
    "admin.canonicalProducts.measure.mass": "Massa",
    "admin.canonicalProducts.measure.volume": "Volume",
    "admin.canonicalProducts.measure.count": "Unidades",
    "admin.canonicalProducts.status.complete": "Completo",
    "admin.canonicalProducts.status.no_image": "Sem imagem",
    "admin.canonicalProducts.status.no_category": "Sem categoria",
    "admin.canonicalProducts.status.no_providers": "Sem lojas",
    "admin.canonicalProducts.status.stale_price": "Preço antigo",
    "admin.canonicalProducts.status.possible_duplicate": "Possível duplicado",
    "admin.canonicalProducts.statusHint.complete": "Não falta nada: tem imagem, categoria, qualidade, lojas vinculadas e preço recente.",
    "admin.canonicalProducts.statusHint.no_image": "Falta a imagem. Pode ser obtida de uma loja vinculada na tela de detalhe.",
    "admin.canonicalProducts.statusHint.no_category": "Sem categoria atribuída: não aparece na árvore de navegação pública.",
    "admin.canonicalProducts.statusHint.no_providers": "Nenhuma loja está vinculada a este canônico, portanto não há preço para comparar.",
    "admin.canonicalProducts.statusHint.stale_price": "Nenhuma execução atualizou o preço deste produto em mais de uma semana.",
    "admin.canonicalProducts.statusHint.possible_duplicate": "Outro canônico compartilha EAN ou marca e tamanho com este. Revise antes que contamine as comparações.",
    "admin.canonicalProducts.ean.reachable": "Alcançável por EAN",
    "admin.canonicalProducts.ean.reachableHint": "Pelo menos uma loja vinculada traz EAN: o matching por código de barras pode cobri-lo.",
    "admin.canonicalProducts.actions.menuLabel": "Ações do produto",
    "admin.canonicalProducts.actions.view": "Ver detalhe",
    "admin.canonicalProducts.actions.edit": "Editar",
    "admin.canonicalProducts.actions.providers": "Ver fornecedores",
    "admin.canonicalProducts.actions.public": "Ver página pública",
    "admin.canonicalProducts.actions.archive": "Arquivar",
    "admin.canonicalProducts.actions.archiveBlocked": "Arquivar ainda não está disponível: requer uma migração do modelo (archived_at).",
    "admin.canonicalProducts.pagination.show": "Mostrar",
    "admin.canonicalProducts.pagination.perPage": "por página",
    "admin.canonicalProducts.pagination.of": "{from}–{to} de {total}",
    "admin.canonicalProducts.providers.title": "Fornecedores correspondidos",
    "admin.canonicalProducts.providers.col.provider": "Loja",
    "admin.canonicalProducts.providers.col.price": "Preço",
    "admin.canonicalProducts.providers.col.lastSeen": "Atualizado",
    "admin.canonicalProducts.providers.col.action": "Loja online",
    "admin.canonicalProducts.providers.cheapest": "Melhor preço",
    "admin.canonicalProducts.providers.open": "Abrir",
    "admin.canonicalProducts.providers.empty": "Nenhuma loja está vinculada a este produto.",
    "admin.canonicalProducts.providers.loading": "Carregando…",
    "admin.canonicalProducts.form.name": "Nome",
    "admin.canonicalProducts.form.brand": "Marca",
    "admin.canonicalProducts.form.brandHint": "Salvo em MAIÚSCULA para que variantes da mesma marca não coexistam.",
    "admin.canonicalProducts.form.amount": "Quantidade",
    "admin.canonicalProducts.form.measure": "Unidade",
    "admin.canonicalProducts.form.displaySize": "Tamanho da embalagem",
    "admin.canonicalProducts.form.quality": "Qualidade",
    "admin.canonicalProducts.form.imageUrl": "URL da imagem",
    "admin.canonicalProducts.form.cancel": "Cancelar",
    "admin.canonicalProducts.create.title": "Adicionar produto canônico",
    "admin.canonicalProducts.create.subtitle": "Nasce sem lojas vinculadas. O slug público é gerado uma vez e não muda depois.",
    "admin.canonicalProducts.create.submit": "Criar produto",
    "admin.canonicalProducts.create.submitting": "Criando…",
    "admin.canonicalProducts.create.error": "Não foi possível criar o produto.",
    "admin.canonicalProducts.edit.title": "Editar produto canônico",
    "admin.canonicalProducts.edit.subtitle": "O slug público NÃO muda ao editar: é o endereço do produto e quebrá-lo quebraria os links compartilhados.",
    "admin.canonicalProducts.edit.submit": "Salvar alterações",
    "admin.canonicalProducts.edit.submitting": "Salvando…",
    "admin.canonicalProducts.edit.error": "Não foi possível salvar as alterações.",
    "admin.canonicalProducts.import.title": "Importar canônicos",
    "admin.canonicalProducts.import.subtitle": "Cole o CSV, revise o que vai acontecer e só então confirme.",
    "admin.canonicalProducts.import.step1": "1. Colar",
    "admin.canonicalProducts.import.step2": "2. Pré-visualizar",
    "admin.canonicalProducts.import.step3": "3. Confirmar",
    "admin.canonicalProducts.import.columns": "Colunas: name, brand, size_amount, size_measure, display_size, quality, image_url",
    "admin.canonicalProducts.import.placeholder": "name,brand,size_amount,size_measure\nArroz Branco,GOYA,5,mass",
    "admin.canonicalProducts.import.preview": "Pré-visualizar",
    "admin.canonicalProducts.import.back": "Voltar",
    "admin.canonicalProducts.import.confirm": "Importar {count}",
    "admin.canonicalProducts.import.confirming": "Importando…",
    "admin.canonicalProducts.import.valid": "{count} prontas para importar",
    "admin.canonicalProducts.import.invalid": "{count} com erro",
    "admin.canonicalProducts.import.warnings": "{count} avisos",
    "admin.canonicalProducts.import.noValidRows": "Nenhuma linha do arquivo é válida. Corrija os erros e pré-visualize novamente.",
    "admin.canonicalProducts.import.row": "Linha {n}",
    "admin.canonicalProducts.import.done": "{count} produtos foram importados.",
    "admin.canonicalProducts.import.close": "Fechar",
    "admin.canonicalProducts.import.error": "Não foi possível processar a importação.",
    "admin.canonicalProducts.actions.unarchive": "Restaurar",
    "admin.canonicalProducts.archive.title": "Arquivar este produto canônico?",
    "admin.canonicalProducts.archive.impact": "Deixará de aparecer no site público, nas comparações e nos trilhos de categoria. NADA é apagado: o histórico de preços, as lojas vinculadas e o link público são preservados, e você pode restaurá-lo quando quiser.",
    "admin.canonicalProducts.archive.confirm": "Arquivar",
    "admin.canonicalProducts.archive.cancel": "Cancelar",
    "admin.canonicalProducts.archive.badge": "Arquivado",
    "admin.canonicalProducts.filters.includeArchived": "Mostrar arquivados",
    "admin.canonicalProducts.form.description": "Descrição",
    "admin.nav.save.canonicalProducts": "Produtos canônicos",
    "admin.canonicalDetail.back": "Voltar ao catálogo",
    "admin.canonicalDetail.notFound": "Este produto canônico não existe.",
    "admin.canonicalDetail.section.info": "Informação canônica",
    "admin.canonicalDetail.section.providers": "Fornecedores correspondidos",
    "admin.canonicalDetail.section.history": "Histórico e KPIs",
    "admin.canonicalDetail.section.evidence": "Evidência",
    "admin.canonicalDetail.section.duplicates": "Possíveis duplicados",
    "admin.canonicalDetail.section.activity": "Atividade e notas",
    "admin.canonicalDetail.info.slug": "Slug público",
    "admin.canonicalDetail.info.size": "Tamanho",
    "admin.canonicalDetail.info.quality": "Qualidade",
    "admin.canonicalDetail.info.category": "Categoria",
    "admin.canonicalDetail.info.description": "Descrição",
    "admin.canonicalDetail.info.created": "Criado",
    "admin.canonicalDetail.info.originRun": "Descoberto na execução",
    "admin.canonicalDetail.info.originRunNone": "Cadastro manual ou anterior à orquestração",
    "admin.canonicalDetail.info.lastMatch": "Último match",
    "admin.canonicalDetail.info.lastPrice": "Último preço visto",
    "admin.canonicalDetail.info.empty": "—",
    "admin.canonicalDetail.kpi.min": "Preço mínimo",
    "admin.canonicalDetail.kpi.max": "Preço máximo",
    "admin.canonicalDetail.kpi.spread": "Diferença",
    "admin.canonicalDetail.kpi.providers": "Lojas ativas",
    "admin.canonicalDetail.kpi.change": "Variação do período",
    "admin.canonicalDetail.kpi.changes": "Mudanças de preço",
    "admin.canonicalDetail.kpi.updated": "Atualizado",
    "admin.canonicalDetail.kpi.noData": "Histórico insuficiente para calcular KPIs.",
    "admin.canonicalDetail.range.15d": "15 dias",
    "admin.canonicalDetail.range.1m": "1 mês",
    "admin.canonicalDetail.range.3m": "3 meses",
    "admin.canonicalDetail.range.6m": "6 meses",
    "admin.canonicalDetail.range.1y": "1 ano",
    "admin.canonicalDetail.range.all": "Tudo",
    "admin.canonicalDetail.chart.empty": "Ainda não há histórico de preços para este produto.",
    "admin.canonicalDetail.chart.carryIn": "O primeiro ponto de cada linha é o preço que já vigorava no início do período.",
    "admin.canonicalDetail.evidence.col.provider": "Loja",
    "admin.canonicalDetail.evidence.col.raw": "Nome na loja",
    "admin.canonicalDetail.evidence.col.ean": "EAN / SKU",
    "admin.canonicalDetail.evidence.col.method": "Como foi vinculado",
    "admin.canonicalDetail.evidence.col.confidence": "Confiança",
    "admin.canonicalDetail.evidence.empty": "Nenhuma loja está vinculada a este canônico.",
    "admin.canonicalDetail.evidence.human": "Decidido por uma pessoa",
    "admin.canonicalDetail.evidence.auto": "Vínculo automático",
    "admin.canonicalDetail.duplicates.empty": "Nenhum possível duplicado detectado.",
    "admin.canonicalDetail.duplicates.eanCollision": "Mesmo EAN",
    "admin.canonicalDetail.duplicates.eanCollisionHint": "Outro canônico compartilha código de barras com este: o sinal mais forte de que são o mesmo produto.",
    "admin.canonicalDetail.duplicates.sameBrandSize": "Mesma marca e tamanho",
    "admin.canonicalDetail.duplicates.readOnly": "Somente alerta: unir ou separar canônicos ainda não está disponível.",
    "admin.canonicalDetail.activity.empty": "Ninguém modificou este canônico ainda.",
    "admin.canonicalDetail.note.title": "Nota interna",
    "admin.canonicalDetail.note.hint": "Visível apenas no admin. Nunca aparece na página pública.",
    "admin.canonicalDetail.note.placeholder": "Coordenação da equipe sobre este produto…",
    "admin.canonicalDetail.note.save": "Salvar nota",
    "admin.canonicalDetail.note.saving": "Salvando…",
    "admin.canonicalDetail.note.saved": "Nota salva",
    "admin.canonicalDetail.action.audit": "Atividade",
    "admin.canonicalDetail.chart.loading": "Carregando histórico…",
    "admin.canonicalDetail.chart.error": "Não foi possível carregar o histórico de preços. Tente novamente em instantes.",
    "admin.canonicalDetail.section.image": "Imagem do produto",
    "admin.canonicalDetail.image.current": "Imagem atual",
    "admin.canonicalDetail.image.candidates": "Pegar de uma loja",
    "admin.canonicalDetail.image.empty": "Nenhuma loja vinculada tem imagem. Você pode colar uma URL em Editar.",
    "admin.canonicalDetail.image.none": "Sem imagem",
    "admin.canonicalDetail.image.use": "Usar esta",
    "admin.canonicalDetail.image.inUse": "Em uso",
    "admin.canonicalDetail.image.hint": "Copia a URL da loja para o canônico. Não modifica o produto da loja.",
    "admin.canonicalDetail.image.uploadBlocked": "Enviar uma imagem do computador exige definir o armazenamento de arquivos.",
    "admin.canonicalDetail.activity.by": "por",
    "admin.canonicalDetail.activity.action.create": "Cadastro manual",
    "admin.canonicalDetail.activity.action.import": "Importação em massa",
    "admin.canonicalDetail.activity.action.update": "Edição",
    "admin.canonicalDetail.activity.action.archive": "Arquivado",
    "admin.canonicalDetail.activity.action.unarchive": "Restaurado",
    "admin.canonicalDetail.activity.action.note": "Nota interna",
    "admin.canonicalDetail.activity.action.addImage": "Imagem adicionada",
    "admin.canonicalDetail.activity.action.removeImage": "Imagem removida",
    "admin.canonicalDetail.activity.action.reorderImages": "Imagens reordenadas",
    "admin.canonicalDetail.activity.action.setCategory": "Categoria atribuída",
    "admin.canonicalDetail.activity.action.regenerateSlug": "Slug regenerado",
    "admin.canonicalDetail.activity.action.unknown": "Alteração no produto",
    "admin.canonicalDetail.chart.retry": "Tentar novamente",
    "admin.canonicalDetail.activity.fields": "Campos:",
    "admin.canonicalDetail.slug.action": "Regenerar slug",
    "admin.canonicalDetail.slug.title": "Regenerar o slug público?",
    "admin.canonicalDetail.slug.warning": "O slug é o endereço público do produto. Alterá-lo quebra os links já compartilhados e os resultados indexados. Não há redirecionamento automático.",
    "admin.canonicalDetail.slug.from": "Atual",
    "admin.canonicalDetail.slug.to": "Ficaria",
    "admin.canonicalDetail.slug.unchanged": "O slug já corresponde ao nome atual: regenerar não mudaria nada.",
    "admin.canonicalDetail.slug.confirm": "Regenerar",
    "admin.canonicalDetail.category.title": "Categoria",
    "admin.canonicalDetail.category.suggestions": "Sugestões",
    "admin.canonicalDetail.category.suggestionsHint": "Derivadas do léxico da taxonomia. Sem IA generativa.",
    "admin.canonicalDetail.category.noSuggestions": "Sem sugestões para este nome: escolha na árvore completa.",
    "admin.canonicalDetail.category.because": "por",
    "admin.canonicalDetail.category.all": "Árvore completa",
    "admin.canonicalDetail.category.showTree": "Ver árvore completa",
    "admin.canonicalDetail.category.hideTree": "Ocultar árvore",
    "admin.canonicalDetail.category.search": "Buscar categoria…",
    "admin.canonicalDetail.category.assign": "Atribuir",
    "admin.canonicalDetail.category.current": "Atual",
    "admin.canonicalDetail.category.signal.lexicon": "léxico",
    "admin.canonicalProducts.bulk.actions": "Ações",
    "admin.canonicalProducts.bulk.assignCategory": "Atribuir categoria ({count})",
    "admin.canonicalProducts.bulk.selectAll": "Selecionar tudo",
    "admin.canonicalProducts.bulk.title": "Atribuir categoria em lote",
    "admin.canonicalProducts.bulk.subtitle": "Será aplicado a {count} produtos selecionados.",
    "admin.canonicalProducts.bulk.heterogeneous": "Atenção: os selecionados parecem de categorias diferentes. Atribuir uma só os agruparia mal.",
    "admin.canonicalProducts.bulk.withoutSignal": "{count} sem sinal para sugerir: seriam classificados às cegas.",
    "admin.canonicalProducts.bulk.supportedBy": "{count} dos selecionados",
    "admin.canonicalProducts.bulk.apply": "Atribuir",
    "admin.canonicalProducts.bulk.applying": "Atribuindo…",
    "admin.canonicalProducts.bulk.done": "{count} produtos atualizados.",
    "admin.canonicalProducts.bulk.someFailed": "{count} não puderam ser atualizados.",
    "admin.canonicalProducts.bulk.error": "Não foi possível aplicar a atribuição.",
    "admin.canonicalProducts.bulk.close": "Fechar",
    "admin.canonicalDetail.image.gallery": "Galeria do canônico",
    "admin.canonicalDetail.image.position": "{n}ª imagem",
    "admin.canonicalDetail.image.primary": "Principal · a que o público vê",
    "admin.canonicalDetail.image.emptyGallery": "Este canônico ainda não tem imagens. Pegue uma das lojas abaixo.",
    "admin.canonicalDetail.image.moveUp": "Subir uma posição",
    "admin.canonicalDetail.image.moveDown": "Descer uma posição",
    "admin.canonicalDetail.image.remove": "Remover da galeria",
    "admin.canonicalDetail.image.fromStore": "De {name}",
    "admin.canonicalDetail.image.manual": "URL manual",
    "admin.canonicalDetail.image.add": "Adicionar",
    "admin.canonicalDetail.image.added": "Já na galeria",
    "admin.canonicalDetail.image.candidatesHint": "Copia a URL da loja para o canônico. Não modifica o produto da loja.",
    "admin.canonicalDetail.image.upload": "Enviar imagem",
    "admin.canonicalDetail.image.uploadSoon": "Enviar do computador ainda não está disponível: falta definir onde os arquivos serão guardados. Por enquanto, pegue das lojas ou cole uma URL em Editar.",
    "admin.canonicalDetail.image.uploadSoonTitle": "Envio de imagens: em breve",
    "admin.canonicalDetail.image.understood": "Entendido",
    "admin.canonicalDetail.image.confirmTitle": "Isto muda o que o público vê",
    "admin.canonicalDetail.image.confirmRemove":
      "A imagem na posição 1 é a que o público vê na página do produto. Ao removê-la, a próxima da galeria ocupa o lugar dela; se não houver outra, o produto fica sem imagem.",
    "admin.canonicalDetail.image.confirmReorder":
      "Você vai mover a imagem que o público vê na página do produto. A mudança é publicada imediatamente.",
    "admin.canonicalDetail.image.confirmRemoveAccept": "Remover mesmo assim",
    "admin.canonicalDetail.image.confirmReorderAccept": "Mover mesmo assim",
    "admin.canonicalDetail.image.confirmCancel": "Cancelar",
    "admin.canonicalDetail.description.title": "Descrição",
    "admin.canonicalDetail.description.current": "Descrição do canônico",
    "admin.canonicalDetail.description.hint": "É a que se publica. Escolha uma das lojas e ajuste se necessário.",
    "admin.canonicalDetail.description.placeholder": "Sem descrição. Pegue uma das lojas ou escreva.",
    "admin.canonicalDetail.description.candidates": "Descrições das lojas",
    "admin.canonicalDetail.description.use": "Usar esta",
    "admin.canonicalDetail.description.inUse": "Em uso",
    "admin.canonicalDetail.description.empty": "Nenhuma loja vinculada publica descrição.",
    "admin.canonicalDetail.description.save": "Salvar descrição",
    "admin.canonicalDetail.description.saving": "Salvando…",
    "admin.canonicalDetail.description.saved": "Descrição salva",
    "admin.canonicalDetail.description.copyHint": "Copia o texto da loja para o canônico. Não modifica o produto da loja.",
    "admin.canonicalDetail.description.unsaved": "Alterações não salvas",
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
