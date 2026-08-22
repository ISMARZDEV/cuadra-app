"""Composition root — DI: cablea puertos → adaptadores y arma los use cases (ADR 24).

Único lugar que conoce las implementaciones concretas. Los controllers reciben los
use cases ya cableados vía `Depends`. La `Session` (`get_session`) es el Unit of Work
(commit al éxito, rollback al error) y se inyecta por request.
"""
from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from src.contexts.save.application.alerts import (
    ListAlertNotifications,
    ListAlerts,
    MarkNotificationsRead,
    RegisterPushToken,
    RunAlertMatching,
    SubscribeAlert,
    UnsubscribeAlert,
)
from src.contexts.save.application.basket_query import (
    CreateBasketQuery,
    ListBasketQueries,
    RemoveBasketQuery,
    UpdateBasketQuery,
)
from src.contexts.save.application.bulk_classify_review import BulkClassifyReview
from src.contexts.save.application.bulk_create_canonicals import BulkCreateCanonicals
from src.contexts.save.application.bulk_resolve_brands import (
    BulkResolveCanonicalBrands,
    BulkResolveMatchBrands,
)
from src.contexts.save.application.resolve_brand import ResolveBrand
from src.contexts.save.application.bulk_resolve_review import BulkResolveReview
from src.contexts.save.application.classify_store_product import ClassifyStoreProduct
from src.contexts.save.application.set_product_category import SetProductCategory
from src.contexts.save.application.match_store_product import MatchStoreProduct
from src.contexts.save.application.rematch_pending import RematchPending
from src.contexts.save.infrastructure.classification.category_judge import CategoryJudge
from src.contexts.save.infrastructure.matching.llm_judge import LlmJudge
from src.contexts.save.infrastructure.classification.lexicon import build_lexicon_index
from src.contexts.save.infrastructure.matching.embeddings import build_api_embedder
from src.contexts.save.application.categories import GetCategory, ListCategories
from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.create_canonical_and_link import CreateCanonicalAndLink
from src.contexts.save.application.embed_canonical_product import EmbedCanonicalProduct
from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.application.canonical_catalog import (
    AddCanonicalImage,
    ArchiveCanonicalProduct,
    BulkSetCanonicalCategory,
    CommitCanonicalImport,
    CreateCanonicalProduct,
    GetCanonicalPriceHistory,
    GetCanonicalProduct,
    GetCanonicalProductCursor,
    ListCanonicalAuditLog,
    ListCanonicalDuplicates,
    ListCanonicalEvidence,
    ListCanonicalImages,
    ListStoreProductImages,
    ListCanonicalProducts,
    ListCanonicalProviders,
    PreviewCanonicalImport,
    PreviewCanonicalSlug,
    RegenerateCanonicalSlug,
    RemoveCanonicalImage,
    ReorderCanonicalImages,
    SetCanonicalCategory,
    SuggestBulkCategories,
    SuggestCanonicalCategories,
    UpdateCanonicalProduct,
    UpdateInternalNote,
)
from src.contexts.save.application.get_review_detail import GetReviewDetail
from src.contexts.save.application.history import GetPriceHistory
from src.contexts.save.application.list_review_queue import ListReviewQueue
from src.contexts.save.application.product_stores import ListProductStores
from src.contexts.save.application.listing import (
    ListBrandProducts,
    ListCategoryProducts,
    ListFeaturedProducts,
    ListProviderProducts,
    ListSimilarProducts,
    ListTodaysDeals,
)
from src.contexts.save.application.products import ListProducts
from src.contexts.save.application.collections import GetCollection, ListCollections
from src.contexts.save.application.providers import (
    ArchiveProvider,
    CreateProvider,
    GetProvider,
    ListAdminProviders,
    ListProviders,
    SetProviderLogo,
    UpdateProvider,
)
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.application.discard_store_product import DiscardStoreProduct
from src.contexts.save.application.promote_store_product import PromoteStoreProductToCanonical
from src.contexts.save.application.relink_store_product import RelinkStoreProduct
from src.contexts.save.application.unlink_store_product import UnlinkStoreProduct
from src.contexts.save.application.search import SearchProducts
from src.contexts.save.application.search_cards import SearchProductCards
from src.contexts.save.application.store_registry import (
    CreateSource,
    ListSourcesHealth,
    PauseSource,
    ResumeSource,
    UpdateSource,
)
from src.contexts.save.application.preview_basket_query import PreviewBasketQuery
from src.contexts.save.application.test_source import TestSource
from src.contexts.save.domain.ports.orchestrator import PipelineOrchestrator
from src.contexts.save.infrastructure.expo_push_sender import ExpoPushSender
from src.contexts.save.infrastructure.matching.embeddings import BgeM3EmbeddingProvider
from src.contexts.save.application.orchestration_policies import (
    CreateAssetPolicy,
    CreateProviderFlow,
)
from src.contexts.save.infrastructure.catalog_sources.factory import directed_capability
from src.contexts.save.infrastructure.orchestrator.dagster_graphql import (
    DagsterGraphQLOrchestrator,
)
from src.contexts.save.infrastructure.orchestrator.policy_repository import (
    SqlOrchestrationGlobalConfigRepository,
    SqlOrchestrationPolicyRepository,
    SqlSectionsReader,
)
from src.contexts.save.infrastructure.orchestrator.run_snapshot_repository import (
    SqlRunSnapshotRepository,
)
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.repositories import (
    SqlAdminAuditRepository,
    SqlAlertRepository,
    SqlBasketQueryRepository,
    SqlAdminCanonicalCatalogRepository,
    SqlCanonicalImageRepository,
    SqlCanonicalProductRepository,
    SqlCollectionRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
    SqlStoreRegistryRepository,
    SqlCategoryCandidateRepository,
    SqlCategoryDecisionRecorder,
    SqlCategoryClassificationRepository,
    SqlTaxonomyRepository,
)

from src.contexts.identity.application.queries import GetMe
from src.contexts.identity.domain.ports import TokenVerifier
from src.contexts.identity.infrastructure.clerk_token_verifier import (
    ClerkTokenVerifier,
    NullTokenVerifier,
)
from src.contexts.identity.infrastructure.repositories import (
    SqlCapabilityGatingRepository,
    SqlUserRepository,
)
from src.contexts.insights.application.daily_target import GetDailyTarget
from src.contexts.insights.application.metrics import GetInsightsMetrics
from src.contexts.insights.application.planning import (
    CreateRecurringRule,
    CreateSavingsGoal,
    CreateSpace,
    SetBudget,
)
from src.contexts.insights.application.queries import (
    ListAccounts,
    ListBudgets,
    ListRecentTransactions,
    ListRecurringRules,
    ListSavingsGoals,
    ListSpaces,
)
from src.contexts.insights.application.reports import (
    GetIncomeVsExpense,
    GetSpendByCategory,
)
from src.contexts.insights.application.transactions import RecordTransaction
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.planning import (
    SqlBudgetRepository,
    SqlRecurringRuleRepository,
    SqlSavingsGoalRepository,
    SqlSpaceRepository,
)
from src.contexts.insights.infrastructure.reports import SqlReportsRepository
from src.contexts.insights.infrastructure.repositories import (
    SqlAccountRepository,
    SqlLedgerRepository,
    SqlTransactionRepository,
)
from src.config import settings
from src.shared.db.base import SessionLocal


# Mercado del admin — single-market, igual que el resto de la consola (`admin_orchestration.MARKET`).
# Vive acá y no se importa del controller: el composition root no debe depender de la capa de API.
SAVE_MARKET = "DO"


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_get_me(session: Session = Depends(get_session)) -> GetMe:
    return GetMe(SqlUserRepository(session), SqlCapabilityGatingRepository(session))


_NULL_VERIFIER = NullTokenVerifier()


@lru_cache(maxsize=1)
def _clerk_verifier_enabled() -> ClerkTokenVerifier:
    """Verificador Clerk real — un único PyJWKClient (cachea el JWKS entre requests)."""
    return ClerkTokenVerifier(
        issuer=settings.clerk_issuer,
        authorized_parties=settings.clerk_authorized_party_list,
        jwk_client=PyJWKClient(settings.clerk_jwks_url),
    )


def get_clerk_verifier() -> TokenVerifier:
    """Verificador de tokens del IdP para la vía RS256 de `get_current_user_id`. Si Clerk no está
    configurado (dev), devuelve el verificador nulo — así el `Depends` no construye un PyJWKClient
    con un issuer vacío y el dev-login (HS256) sigue funcionando."""
    if not settings.clerk_enabled:
        return _NULL_VERIFIER
    return _clerk_verifier_enabled()


def get_preference_repository(
    session: Session = Depends(get_session),
):  # type: ignore[no-untyped-def]
    from src.contexts.aispace.infrastructure.repositories import SqlPreferenceRepository

    return SqlPreferenceRepository(session)


def get_user_repository(session: Session = Depends(get_session)) -> SqlUserRepository:
    """Lectura directa de identity (sin el resto de `GetMe`) — usada por aispace para derivar la
    moneda principal de `home_market` (§currency-preferences)."""
    return SqlUserRepository(session)


def get_record_transaction(
    session: Session = Depends(get_session),
) -> RecordTransaction:
    return RecordTransaction(
        SqlAccountRepository(session),
        SqlTransactionRepository(session),
        SqlLedgerRepository(session),
    )


def get_get_insights_metrics(
    session: Session = Depends(get_session),
) -> GetInsightsMetrics:
    return GetInsightsMetrics(SqlInsightsMetricsRepository(session))


def get_get_daily_target(session: Session = Depends(get_session)) -> GetDailyTarget:
    return GetDailyTarget(
        SqlInsightsMetricsRepository(session), SqlBudgetRepository(session)
    )


def get_set_budget(session: Session = Depends(get_session)) -> SetBudget:
    return SetBudget(SqlAccountRepository(session), SqlBudgetRepository(session))


def get_create_space(session: Session = Depends(get_session)) -> CreateSpace:
    return CreateSpace(SqlAccountRepository(session), SqlSpaceRepository(session))


def get_create_savings_goal(
    session: Session = Depends(get_session),
) -> CreateSavingsGoal:
    return CreateSavingsGoal(
        SqlAccountRepository(session), SqlSavingsGoalRepository(session)
    )


def get_create_recurring_rule(
    session: Session = Depends(get_session),
) -> CreateRecurringRule:
    return CreateRecurringRule(
        SqlAccountRepository(session), SqlRecurringRuleRepository(session)
    )


# ── Read models (queries) ────────────────────────────────────────────────────
def get_list_accounts(session: Session = Depends(get_session)) -> ListAccounts:
    return ListAccounts(
        SqlAccountRepository(session), SqlInsightsMetricsRepository(session)
    )


def get_list_recent_transactions(
    session: Session = Depends(get_session),
) -> ListRecentTransactions:
    return ListRecentTransactions(SqlTransactionRepository(session))


def get_list_spaces(session: Session = Depends(get_session)) -> ListSpaces:
    return ListSpaces(SqlSpaceRepository(session))


def get_list_budgets(session: Session = Depends(get_session)) -> ListBudgets:
    return ListBudgets(SqlBudgetRepository(session))


def get_list_savings_goals(
    session: Session = Depends(get_session),
) -> ListSavingsGoals:
    return ListSavingsGoals(SqlSavingsGoalRepository(session))


def get_list_recurring_rules(
    session: Session = Depends(get_session),
) -> ListRecurringRules:
    return ListRecurringRules(SqlRecurringRuleRepository(session))


def get_get_spend_by_category(
    session: Session = Depends(get_session),
) -> GetSpendByCategory:
    return GetSpendByCategory(SqlReportsRepository(session))


def get_get_income_vs_expense(
    session: Session = Depends(get_session),
) -> GetIncomeVsExpense:
    return GetIncomeVsExpense(SqlReportsRepository(session))


# ── AISpace orquestador ──────────────────────────────────────────────────────
# Checkpointer Postgres = singleton perezoso (D3). Lazy (no en lifespan) para no acoplar
# el arranque de la app a la DB ni correr en los tests de otros contextos. Se crea en el
# primer request real de aispace; los tests del chat hacen override de `get_aispace_graph`.
_aispace_checkpointer: dict[str, object] = {}


def get_aispace_checkpointer() -> object:
    cp = _aispace_checkpointer.get("cp")
    if cp is None:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg import Connection

        uri = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
        conn = Connection.connect(uri, autocommit=True)
        cp = PostgresSaver(conn)
        cp.setup()
        _aispace_checkpointer["cp"] = cp
    return cp


def get_aispace_graph(checkpointer: object = Depends(get_aispace_checkpointer)):  # type: ignore[no-untyped-def]
    from src.contexts.aispace.agents.groceries.tools.catalog import compare_by_canonical_id
    from src.contexts.aispace.flows.expense.categories import suggest_expense_categories
    from src.contexts.aispace.flows.expense.flow import build_expense_flow
    from src.contexts.aispace.flows.groceries.flow import build_groceries_flow
    from src.contexts.aispace.orchestration.graph import build_graph
    from src.contexts.aispace.orchestration.registry import build_registry
    from src.contexts.aispace.orchestration.router import llm_classifier

    # session_factory = SessionLocal: cada tool abre su propia UoW (D1, sobrevive el HITL).
    registry = build_registry(SessionLocal)

    # register_expense corre el flow multi-step (confirm → ¿categoría? → sugerencias → commit + deep
    # link). commit_action reusa el commit del FinanceAgent con la acción enriquecida con la categoría
    # que eligió el usuario; las sugerencias salen de un LLM (memoizado por `prepare`).
    finance = registry["register_expense"]
    expense_flow = build_expense_flow(
        commit_action=lambda state, action: finance.commit({**state, "pending_action": action}),
        suggest_categories=suggest_expense_categories,
    )
    # groceries corre el flujo de DESAMBIGUACIÓN (§5.4·A): cuando la consulta nombra una familia
    # («arroz») y no un producto, el dock pregunta cuál en vez de que el agente adivine. Es de
    # SOLO LECTURA — el paso terminal compara el elegido, no escribe nada.
    groceries_flow = build_groceries_flow(
        compare_by_id=lambda canonical_id: compare_by_canonical_id(
            # "DO" fijo, igual que el default del agente y del resto de Save (riesgo #8 del
            # plan: el mercado todavía no sale de configuración). No es regresión de esta fase.
            SessionLocal, "DO", canonical_id
        )
    )
    return build_graph(
        checkpointer,
        classifier=llm_classifier,
        registry=registry,
        flow_registry={"register_expense": expense_flow, "groceries": groceries_flow},
    )


# ── Save (catálogo de precios) ──
def get_search_product_cards(session: Session = Depends(get_session)) -> SearchProductCards:
    """Búsqueda con TARJETAS: reutiliza el MISMO ranking híbrido que `/save/search` y lo cruza con
    la oferta vigente. Compartir el ranking es lo que garantiza que las dos búsquedas no diverjan.
    """
    return SearchProductCards(
        get_search_products(session),
        SqlStoreProductRepository(session),
    )


def get_search_products(session: Session = Depends(get_session)) -> SearchProducts:
    # Búsqueda HÍBRIDA (§6): léxica + semántica fusionadas por RRF. Sin embedder resuelto,
    # `SearchProducts` omite la etapa semántica y degrada a léxica — nunca inventa un vector.
    return SearchProducts(
        SqlCanonicalProductRepository(session),
        embedding_provider=build_api_embedder(
            endpoint_url=settings.save_bge_m3_endpoint_url
        ),
    )


def get_compare_product(session: Session = Depends(get_session)) -> CompareProduct:
    return CompareProduct(
        SqlCanonicalProductRepository(session),
        SqlStoreProductRepository(session),
        SqlTaxonomyRepository(session),
        # La galería del carrusel. El mismo repositorio que ya usaba el admin: la fuente de verdad
        # de las fotos es una sola, y que el público leyera otra es cómo el admin y la app acaban
        # enseñando imágenes distintas del mismo producto.
        SqlCanonicalImageRepository(session),
    )


def get_list_categories(session: Session = Depends(get_session)) -> ListCategories:
    return ListCategories(SqlTaxonomyRepository(session))


def get_category(session: Session = Depends(get_session)) -> GetCategory:
    return GetCategory(SqlTaxonomyRepository(session))


def get_list_providers(session: Session = Depends(get_session)) -> ListProviders:
    return ListProviders(SqlProviderRepository(session))


def get_list_admin_providers(session: Session = Depends(get_session)) -> ListAdminProviders:
    return ListAdminProviders(SqlProviderRepository(session))


def get_provider(session: Session = Depends(get_session)) -> GetProvider:
    return GetProvider(SqlProviderRepository(session))


def get_admin_audit_repo(session: Session = Depends(get_session)) -> SqlAdminAuditRepository:
    """Repo del audit log del admin (T2). El controller lo compone con el actor del request en un
    `AdminAuditRecorder` — aquí NO se resuelve el actor (evita el ciclo con extensions.security)."""
    return SqlAdminAuditRepository(session)


def get_pipeline_orchestrator() -> PipelineOrchestrator:
    """Adapter del runner (F4). NO toma `session`: el runner es un sistema externo, no tiene nada
    que ver con la Unit of Work del request.

    Se construye SIEMPRE, incluso con la URL vacía: en ese caso el adapter levanta
    `OrchestratorUnavailable` en cada llamada y la consola degrada a `disconnected` — que es
    exactamente el comportamiento que pide el SDD §8. Devolver `None` obligaría a cada consumidor a
    chequear nulos y a inventar su propia degradación.
    """
    return DagsterGraphQLOrchestrator(url=settings.save_dagster_graphql_url)


def get_provider_repo(session: Session = Depends(get_session)) -> SqlProviderRepository:
    """Lectura de providers para la consola de Orquestación: la tabla necesita el NOMBRE, no solo
    el id — con tres filas que dicen `provider_prices_refresh` el operador no sabe cuál es cuál."""
    return SqlProviderRepository(session)


def get_orchestration_policy_repo(
    session: Session = Depends(get_session),
) -> SqlOrchestrationPolicyRepository:
    return SqlOrchestrationPolicyRepository(session)


def get_orchestration_config_repo(
    session: Session = Depends(get_session),
) -> SqlOrchestrationGlobalConfigRepository:
    return SqlOrchestrationGlobalConfigRepository(session)


def get_run_snapshot_repo(session: Session = Depends(get_session)) -> SqlRunSnapshotRepository:
    return SqlRunSnapshotRepository(session)


def get_create_provider_flow(session: Session = Depends(get_session)) -> CreateProviderFlow:
    """`capability_of` se INYECTA porque solo la capa que conoce los profiles REST puede responder
    por una fuente concreta — y porque la compatibilidad del flow se DERIVA de ahí, nunca de una
    allowlist de plataformas (corrección del SDD; ver el use-case)."""
    return CreateProviderFlow(
        policy_repo=SqlOrchestrationPolicyRepository(session),
        registry_repo=SqlStoreRegistryRepository(session),
        capability_of=lambda source: directed_capability(source.platform, source.endpoints),
    )


def get_sections_reader(session: Session = Depends(get_session)) -> SqlSectionsReader:
    """Secciones de la fuente: el browse las necesita para armar sus particiones."""
    return SqlSectionsReader(session)


def get_create_asset_policy(session: Session = Depends(get_session)) -> CreateAssetPolicy:
    """Assets GLOBALES: sin registry ni capacidad — no cuelgan de una tienda."""
    return CreateAssetPolicy(policy_repo=SqlOrchestrationPolicyRepository(session))


def get_create_provider(session: Session = Depends(get_session)) -> CreateProvider:
    return CreateProvider(SqlProviderRepository(session))


def get_update_provider(session: Session = Depends(get_session)) -> UpdateProvider:
    return UpdateProvider(SqlProviderRepository(session))


def get_set_provider_logo(session: Session = Depends(get_session)) -> SetProviderLogo:
    return SetProviderLogo(SqlProviderRepository(session))


def get_archive_provider(session: Session = Depends(get_session)) -> ArchiveProvider:
    return ArchiveProvider(SqlProviderRepository(session))


def get_create_source(session: Session = Depends(get_session)) -> CreateSource:
    return CreateSource(SqlStoreRegistryRepository(session))


def get_update_source(session: Session = Depends(get_session)) -> UpdateSource:
    return UpdateSource(SqlStoreRegistryRepository(session))


def get_pause_source(session: Session = Depends(get_session)) -> PauseSource:
    return PauseSource(SqlStoreRegistryRepository(session))


def get_resume_source(session: Session = Depends(get_session)) -> ResumeSource:
    return ResumeSource(SqlStoreRegistryRepository(session))


def get_test_source(session: Session = Depends(get_session)) -> TestSource:
    return TestSource(SqlStoreRegistryRepository(session), SqlProviderRepository(session))


def get_preview_basket_query(session: Session = Depends(get_session)) -> PreviewBasketQuery:
    return PreviewBasketQuery(
        SqlStoreRegistryRepository(session), SqlProviderRepository(session)
    )


def get_list_sources_health(session: Session = Depends(get_session)) -> ListSourcesHealth:
    return ListSourcesHealth(
        SqlStoreRegistryRepository(session),
        SqlStoreProductRepository(session),
        SqlProviderRepository(session),
    )


def get_list_basket_queries(session: Session = Depends(get_session)) -> ListBasketQueries:
    return ListBasketQueries(SqlBasketQueryRepository(session))


def get_create_basket_query(session: Session = Depends(get_session)) -> CreateBasketQuery:
    return CreateBasketQuery(SqlBasketQueryRepository(session))


def get_update_basket_query(session: Session = Depends(get_session)) -> UpdateBasketQuery:
    return UpdateBasketQuery(SqlBasketQueryRepository(session))


def get_remove_basket_query(session: Session = Depends(get_session)) -> RemoveBasketQuery:
    return RemoveBasketQuery(SqlBasketQueryRepository(session))


def get_list_category_products(
    session: Session = Depends(get_session),
) -> ListCategoryProducts:
    return ListCategoryProducts(
        SqlTaxonomyRepository(session), SqlStoreProductRepository(session)
    )


def get_list_featured_products(
    session: Session = Depends(get_session),
) -> ListFeaturedProducts:
    return ListFeaturedProducts(SqlStoreProductRepository(session))


def get_list_collections(session: Session = Depends(get_session)) -> ListCollections:
    return ListCollections(SqlCollectionRepository(session), SqlStoreProductRepository(session))


def get_collection(session: Session = Depends(get_session)) -> GetCollection:
    return GetCollection(SqlCollectionRepository(session), SqlStoreProductRepository(session))


def get_list_brand_products(session: Session = Depends(get_session)) -> ListBrandProducts:
    return ListBrandProducts(
        SqlCanonicalProductRepository(session), SqlStoreProductRepository(session)
    )


def get_list_product_stores(session: Session = Depends(get_session)) -> ListProductStores:
    """Mismo repo de catálogo que el panel del admin — a propósito: una sola consulta, un solo
    juego de números. Lo que cambia entre las dos pantallas es el DTO, no la fuente."""
    return ListProductStores(
        SqlCanonicalProductRepository(session), SqlAdminCanonicalCatalogRepository(session)
    )


def get_list_similar_products(session: Session = Depends(get_session)) -> ListSimilarProducts:
    return ListSimilarProducts(
        SqlCanonicalProductRepository(session), SqlStoreProductRepository(session)
    )


def get_price_history(session: Session = Depends(get_session)) -> GetPriceHistory:
    return GetPriceHistory(
        SqlCanonicalProductRepository(session), SqlStoreProductRepository(session)
    )


def get_list_price_drops(session: Session = Depends(get_session)) -> ListPriceDrops:
    return ListPriceDrops(SqlStoreProductRepository(session))


def get_list_todays_deals(session: Session = Depends(get_session)) -> ListTodaysDeals:
    return ListTodaysDeals(SqlStoreProductRepository(session))


def get_list_provider_products(
    session: Session = Depends(get_session),
) -> ListProviderProducts:
    return ListProviderProducts(SqlStoreProductRepository(session))


# ── Alertas de precio (G4) ──
def get_subscribe_alert(session: Session = Depends(get_session)) -> SubscribeAlert:
    return SubscribeAlert(SqlAlertRepository(session), SqlCanonicalProductRepository(session))


def get_list_alerts(session: Session = Depends(get_session)) -> ListAlerts:
    return ListAlerts(SqlAlertRepository(session))


def get_unsubscribe_alert(session: Session = Depends(get_session)) -> UnsubscribeAlert:
    return UnsubscribeAlert(SqlAlertRepository(session))


def get_list_alert_notifications(
    session: Session = Depends(get_session),
) -> ListAlertNotifications:
    return ListAlertNotifications(SqlAlertRepository(session))


def get_mark_notifications_read(
    session: Session = Depends(get_session),
) -> MarkNotificationsRead:
    return MarkNotificationsRead(SqlAlertRepository(session))


def get_run_alert_matching(session: Session = Depends(get_session)) -> RunAlertMatching:
    return RunAlertMatching(
        SqlStoreProductRepository(session), SqlAlertRepository(session), ExpoPushSender()
    )


def get_register_push_token(session: Session = Depends(get_session)) -> RegisterPushToken:
    return RegisterPushToken(SqlAlertRepository(session))


def get_list_products(session: Session = Depends(get_session)) -> ListProducts:
    return ListProducts(SqlCanonicalProductRepository(session))


# ── Admin — cola de revisión de matching (F2 · B1) ──
def get_list_review_queue(session: Session = Depends(get_session)) -> ListReviewQueue:
    return ListReviewQueue(SqlProductMatchRepository(session))


def get_review_detail(session: Session = Depends(get_session)) -> GetReviewDetail:
    return GetReviewDetail(
        match_repo=SqlProductMatchRepository(session), store_repo=SqlStoreProductRepository(session)
    )


def get_resolve_review(session: Session = Depends(get_session)) -> ResolveReview:
    return ResolveReview(SqlProductMatchRepository(session), SqlStoreProductRepository(session))


def get_create_canonical_and_link(
    session: Session = Depends(get_session),
) -> CreateCanonicalAndLink:
    return CreateCanonicalAndLink(
        canonical_repo=SqlCanonicalProductRepository(session),
        resolver=ResolveReview(SqlProductMatchRepository(session), SqlStoreProductRepository(session)),
        # F4 #4.5: para atribuir el canónico nuevo a la corrida que encoló el match que el humano
        # está resolviendo. Sin esto la creación funciona igual, pero `new_canonicals_count`
        # contaría siempre cero.
        match_repo=SqlProductMatchRepository(session),
        # Herencia de la galería del proveedor: el canónico nace con las fotos que esa tienda ya
        # publicó. MISMA `session` que el resto — la transacción única es el invariante más
        # delicado de este flujo.
        store_repo=SqlStoreProductRepository(session),
        image_repo=SqlCanonicalImageRepository(session),
        # US-CP-L14: el canónico entra al índice semántico al nacer. Sin esto quedaba invisible
        # para la etapa vectorial hasta el próximo backfill — y como la cola es JUSTO donde nacen
        # los canónicos, esa ventana se retroalimentaba.
        embedder=build_inline_canonical_embedder(session),
    )


def get_resolve_brand(session: Session = Depends(get_session)) -> ResolveBrand:
    """Reconocedor de marca contra el catálogo conocido.

    Existía sólo en el composition root de la INGESTA; el admin lo necesita ahora para la acción
    en lote "Clasificar marcas". Cachea el índice por mercado dentro de la instancia, así que una
    por request es exactamente lo que se quiere: un lote entero comparte el mismo índice.
    """
    return ResolveBrand(SqlCanonicalProductRepository(session))


def get_bulk_resolve_match_brands(
    session: Session = Depends(get_session),
) -> BulkResolveMatchBrands:
    """La `Session` entra por los SAVEPOINTS: una fila que falla no arrastra a las confirmadas."""
    return BulkResolveMatchBrands(
        scope=session,
        products=SqlCategoryClassificationRepository(session),
        store_repo=SqlStoreProductRepository(session),
        resolver=get_resolve_brand(session),
        market_id=SAVE_MARKET,
    )


def get_bulk_resolve_canonical_brands(
    session: Session = Depends(get_session),
) -> BulkResolveCanonicalBrands:
    canonical_repo = SqlCanonicalProductRepository(session)
    return BulkResolveCanonicalBrands(
        scope=session,
        catalog=canonical_repo,
        # Las marcas de las tiendas enlazadas: es el dato OBSERVADO, y gana sobre lo deducido.
        provider_brands=SqlStoreProductRepository(session),
        writer=canonical_repo,
        resolver=ResolveBrand(canonical_repo),
        market_id=SAVE_MARKET,
    )


def get_bulk_resolve_review(session: Session = Depends(get_session)) -> BulkResolveReview:
    return BulkResolveReview(
        scope=session,
        resolver=ResolveReview(SqlProductMatchRepository(session), SqlStoreProductRepository(session)),
    )


def get_bulk_classify_review(session: Session = Depends(get_session)) -> BulkClassifyReview:
    """Clasificador en lote para la cola de revisión — **sin las etapas que necesitan modelo**.

    `embedder=None` y `judge=None` NO son un recorte perezoso: `sentence-transformers` (BGE-M3) vive
    en el grupo de dependencias `ingestion`, que la imagen de la API deliberadamente no lleva (misma
    regla que `dagster`). Importarlo acá reventaría la API al arrancar en producción, con un fallo
    que en local no se ve porque el grupo sí está instalado.

    Que quede útil no es suerte: medido sobre la cola real (48 filas), las etapas deterministas
    —léxico por nombre + señal de ORIGEN (`source_category`, que las tiendas sí mandan)— resolvieron
    el 100%. Lo que el léxico no resuelva queda en banda gris para el humano, que es exactamente lo
    que la regla sagrada del módulo manda: ante duda, no inventar.

    El índice léxico se arma por request desde la taxonomía (120 hojas → 151 tokens): es una query
    y un dict, no justifica un cache con invalidación que se desincronice al sembrar categorías.
    """
    tree = SqlTaxonomyRepository(session).list_tree(SAVE_MARKET)
    leaves = [(child.id, child.name) for root in tree for child in root.children]
    classifications = SqlCategoryClassificationRepository(session)
    return BulkClassifyReview(
        scope=session,
        products=classifications,
        classifier=ClassifyStoreProduct(
            classifications,
            SqlCategoryCandidateRepository(session),
            # Etapa VECTORIAL: endpoint HTTP en prod, modelo in-process en dev, `None` si no hay
            # ninguno (ver `build_api_embedder`). Sin ella la cascada retornaba antes de llegar al
            # juez, así que desde el admin «Clasificar seleccionados» nunca lo invocaba —el flag no
            # tenía nada que ver— y la banda gris quedaba sin resolver.
            build_api_embedder(endpoint_url=settings.save_bge_m3_endpoint_url),
            # Mismo switch preventivo que la ingesta. Sólo se alcanza si hay embedder.
            CategoryJudge() if settings.save_llm_judge_enabled else None,
            build_lexicon_index(leaves),
            # La bitácora también acá: una clasificación disparada a mano desde la consola es tan
            # digna de auditar como una de la ingesta, y sin esto el 100% de las decisiones del
            # admin serían invisibles para la medición.
            decisions=SqlCategoryDecisionRecorder(session),
            # Nombres de hoja: el juez necesita PREGUNTAR por una categoría con su nombre, y el
            # léxico sólo devuelve ids. Sin esto no puede arbitrar el conflicto origen-vs-nombre.
            leaf_names={leaf_id: name for leaf_id, name in leaves},
            # Gate de DEPARTAMENTO: NO se cablea. La capacidad existe y está testeada, pero el A/B
            # con el juez encendido la desaconseja — ver `_department_of` en el use case.
        ),
    )


def get_rematch_pending(session: Session = Depends(get_session)) -> RematchPending:
    """Re-corre la cascada sobre filas YA encoladas, contra el catálogo ACTUAL.

    Los candidatos de la cola son ESTÁTICOS: `RefreshCatalogPrices` sólo enruta al matcher los
    `store_product` DESCONOCIDOS, así que una fila que entró cuando el catálogo era chico arrastra
    para siempre los candidatos de ese día. Esto es la única forma de refrescarlos sin descartar la
    fila (que además pierde el histórico de precios).

    La etapa VECTORIAL depende de `build_api_embedder`: endpoint HTTP (prod) → modelo in-process
    (dev, donde el grupo `ingestion` sí está) → `None`. Con `None` la cascada la OMITE y corre con
    EAN + trgm; no se le inventa un vector, que devolvería vecinos arbitrarios.

    Mismo índice léxico por request que `get_bulk_classify_review`, y por la misma razón: una query
    y un dict no justifican un cache que se desincronice al sembrar categorías.
    """
    tree = SqlTaxonomyRepository(session).list_tree(SAVE_MARKET)
    leaves = [(child.id, child.name) for root in tree for child in root.children]
    return RematchPending(
        scope=session,
        products=SqlProductMatchRepository(session),
        # Nombres de los canónicos enlazados: sin ellos el resumen del lote son ids contra ids y
        # el operador no puede auditar si el enlace fue correcto.
        canonicals=SqlCanonicalProductRepository(session),
        matcher=MatchStoreProduct(
            match_repo=SqlProductMatchRepository(session),
            store_repo=SqlStoreProductRepository(session),
            canonical_repo=SqlCanonicalProductRepository(session),
            embedding_provider=build_api_embedder(
                endpoint_url=settings.save_bge_m3_endpoint_url
            ),
            judge=LlmJudge() if settings.save_llm_judge_enabled else None,
            category_lexicon=build_lexicon_index(leaves),
            leaf_to_parent={child.id: root.id for root in tree for child in root.children},
        ),
    )


def get_set_product_category(session: Session = Depends(get_session)) -> SetProductCategory:
    return SetProductCategory(SqlCategoryClassificationRepository(session))


def get_bulk_create_canonicals(
    session: Session = Depends(get_session),
    creator: CreateCanonicalAndLink = Depends(get_create_canonical_and_link),
) -> BulkCreateCanonicals:
    """Canonización en lote. Reusa `CreateCanonicalAndLink` tal cual: ese use case ya mantiene el
    invariante de MISMA transacción (canónico + enlace + match en una sola escritura), y
    reimplementarlo acá sería tener dos versiones de la regla más delicada del módulo."""
    return BulkCreateCanonicals(
        scope=session,
        products=SqlCategoryClassificationRepository(session),
        creator=creator,
        market_id=SAVE_MARKET,
    )


def get_taxonomy_repo(session: Session = Depends(get_session)) -> SqlTaxonomyRepository:
    """Repo de taxonomía crudo — el selector de categoría de la cola solo necesita listar hojas
    con su id, sin la proyección pública (que expone slugs y esconde ids)."""
    return SqlTaxonomyRepository(session)


# --------------------------------------------------- Catálogo canónico admin (F5, SDD List) --

def get_canonical_catalog_repo(
    session: Session = Depends(get_session),
) -> SqlAdminCanonicalCatalogRepository:
    return SqlAdminCanonicalCatalogRepository(session)


def get_list_canonical_products(
    session: Session = Depends(get_session),
) -> ListCanonicalProducts:
    return ListCanonicalProducts(SqlAdminCanonicalCatalogRepository(session))


def get_get_canonical_product(
    session: Session = Depends(get_session),
) -> GetCanonicalProduct:
    return GetCanonicalProduct(SqlAdminCanonicalCatalogRepository(session))


def get_get_canonical_product_cursor(
    session: Session = Depends(get_session),
) -> GetCanonicalProductCursor:
    return GetCanonicalProductCursor(SqlAdminCanonicalCatalogRepository(session))


def get_list_canonical_providers(
    session: Session = Depends(get_session),
) -> ListCanonicalProviders:
    return ListCanonicalProviders(SqlAdminCanonicalCatalogRepository(session))


def get_list_canonical_evidence(
    session: Session = Depends(get_session),
) -> ListCanonicalEvidence:
    return ListCanonicalEvidence(SqlAdminCanonicalCatalogRepository(session))


def get_list_canonical_duplicates(
    session: Session = Depends(get_session),
) -> ListCanonicalDuplicates:
    return ListCanonicalDuplicates(SqlAdminCanonicalCatalogRepository(session))


def build_inline_canonical_embedder(session: Session) -> EmbedCanonicalProduct | None:
    """Embebe en el acto lo que el admin escribe (US-CP-L14). `None` = se deja al backfill.

    Dos condiciones, y ninguna es caprichosa:

    - `save_matching_cascade_enabled`: con la cascada dark NADIE lee embeddings, así que embeber
      sería puro costo. Mismo gate que `build_canonical_embedder` en la ingesta, y MISMO modelo —
      vectores de modelos distintos no son comparables.
    - `save_bge_m3_endpoint_url`: sin endpoint, `build_embedding_provider` caería al BGE-M3
      IN-PROCESS (sentence-transformers), que dentro de un worker de FastAPI significa cargar el
      modelo en el proceso que atiende requests. Eso no se hace por conveniencia: en el API el
      embebido inline existe SÓLO contra el servicio dedicado.

    En ambos casos el `embedding` queda NULL y el backfill lo levanta — la corrección no depende de
    esto, sólo la latencia con que el canónico entra al índice semántico.
    """
    if not settings.save_matching_cascade_enabled or not settings.save_bge_m3_endpoint_url:
        return None
    return EmbedCanonicalProduct(
        SqlCanonicalProductRepository(session),
        BgeM3EmbeddingProvider(settings.save_bge_m3_endpoint_url),
    )


def get_create_canonical_product(
    session: Session = Depends(get_session),
) -> CreateCanonicalProduct:
    return CreateCanonicalProduct(
        SqlCanonicalProductRepository(session),
        SqlAdminCanonicalCatalogRepository(session),
        embedder=build_inline_canonical_embedder(session),
    )


def get_update_canonical_product(
    session: Session = Depends(get_session),
) -> UpdateCanonicalProduct:
    return UpdateCanonicalProduct(
        SqlCanonicalProductRepository(session),
        SqlAdminCanonicalCatalogRepository(session),
        embedder=build_inline_canonical_embedder(session),
    )


def get_preview_canonical_import(
    session: Session = Depends(get_session),
) -> PreviewCanonicalImport:
    return PreviewCanonicalImport(SqlAdminCanonicalCatalogRepository(session))


def get_commit_canonical_import(
    session: Session = Depends(get_session),
) -> CommitCanonicalImport:
    """La Session entra al use case porque el import necesita SAVEPOINTS por fila — una fila
    inválida no puede arrastrar a las siguientes."""
    return CommitCanonicalImport(
        SqlCanonicalProductRepository(session),
        SqlAdminCanonicalCatalogRepository(session),
        session,
    )


# --------------------------------- acciones por proveedor del detalle canónico (menú de acciones)
# Las cuatro comparten la Session del request: el invariante de misma-transacción (FK denormalizado
# + product_match) solo se sostiene si repos y use case viven en la MISMA UoW.


def get_discard_store_product(
    session: Session = Depends(get_session),
) -> DiscardStoreProduct:
    return DiscardStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
    )


def get_unlink_store_product(session: Session = Depends(get_session)) -> UnlinkStoreProduct:
    return UnlinkStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
    )


def get_relink_store_product(session: Session = Depends(get_session)) -> RelinkStoreProduct:
    return RelinkStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
    )


def get_promote_store_product(
    session: Session = Depends(get_session),
) -> PromoteStoreProductToCanonical:
    return PromoteStoreProductToCanonical(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
        canonical_repo=SqlCanonicalProductRepository(session),
        image_repo=SqlCanonicalImageRepository(session),
        market_id=SAVE_MARKET,
    )


def get_archive_canonical_product(
    session: Session = Depends(get_session),
) -> ArchiveCanonicalProduct:
    return ArchiveCanonicalProduct(
        SqlCanonicalProductRepository(session), SqlAdminCanonicalCatalogRepository(session)
    )


def get_update_internal_note(session: Session = Depends(get_session)) -> UpdateInternalNote:
    return UpdateInternalNote(
        SqlCanonicalProductRepository(session), SqlAdminCanonicalCatalogRepository(session)
    )


def get_canonical_price_history(
    session: Session = Depends(get_session),
) -> GetCanonicalPriceHistory:
    return GetCanonicalPriceHistory(
        SqlAdminCanonicalCatalogRepository(session), SqlStoreProductRepository(session)
    )


def get_list_canonical_audit_log(
    session: Session = Depends(get_session),
) -> ListCanonicalAuditLog:
    return ListCanonicalAuditLog(SqlAdminAuditRepository(session))


def get_preview_canonical_slug(session: Session = Depends(get_session)) -> PreviewCanonicalSlug:
    return PreviewCanonicalSlug(SqlCanonicalProductRepository(session))


def get_regenerate_canonical_slug(
    session: Session = Depends(get_session),
) -> RegenerateCanonicalSlug:
    return RegenerateCanonicalSlug(
        SqlCanonicalProductRepository(session), SqlAdminCanonicalCatalogRepository(session)
    )


def get_suggest_canonical_categories(
    session: Session = Depends(get_session),
) -> SuggestCanonicalCategories:
    """Sin embedder ni juez: el léxico es determinista y no necesita modelo — BGE-M3 no está en
    la imagen de la API (mismo criterio que `get_bulk_classify_review`)."""
    return SuggestCanonicalCategories(
        SqlAdminCanonicalCatalogRepository(session), SqlTaxonomyRepository(session)
    )


def get_set_canonical_category(session: Session = Depends(get_session)) -> SetCanonicalCategory:
    return SetCanonicalCategory(
        SqlCanonicalProductRepository(session),
        SqlAdminCanonicalCatalogRepository(session),
        SqlCategoryClassificationRepository(session),
    )


def get_suggest_bulk_categories(session: Session = Depends(get_session)) -> SuggestBulkCategories:
    return SuggestBulkCategories(
        SqlAdminCanonicalCatalogRepository(session), SqlTaxonomyRepository(session)
    )


def get_bulk_set_canonical_category(
    session: Session = Depends(get_session),
) -> BulkSetCanonicalCategory:
    """La Session entra al use case por los SAVEPOINTS: una fila que falla no puede arrastrar
    a las que ya se confirmaron en el mismo lote."""
    return BulkSetCanonicalCategory(get_set_canonical_category(session), session)


def get_list_canonical_images(session: Session = Depends(get_session)) -> ListCanonicalImages:
    return ListCanonicalImages(SqlCanonicalImageRepository(session))


def get_list_store_product_images(
    session: Session = Depends(get_session),
) -> ListStoreProductImages:
    return ListStoreProductImages(SqlStoreProductRepository(session))


def get_add_canonical_image(session: Session = Depends(get_session)) -> AddCanonicalImage:
    return AddCanonicalImage(SqlCanonicalImageRepository(session))


def get_reorder_canonical_images(
    session: Session = Depends(get_session),
) -> ReorderCanonicalImages:
    return ReorderCanonicalImages(SqlCanonicalImageRepository(session))


def get_remove_canonical_image(session: Session = Depends(get_session)) -> RemoveCanonicalImage:
    return RemoveCanonicalImage(SqlCanonicalImageRepository(session))
