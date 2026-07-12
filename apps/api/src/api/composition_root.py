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
from src.contexts.save.application.bulk_resolve_review import BulkResolveReview
from src.contexts.save.application.categories import GetCategory, ListCategories
from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.create_canonical_and_link import CreateCanonicalAndLink
from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.application.get_review_detail import GetReviewDetail
from src.contexts.save.application.history import GetPriceHistory
from src.contexts.save.application.list_review_queue import ListReviewQueue
from src.contexts.save.application.listing import (
    ListBrandProducts,
    ListCategoryProducts,
    ListFeaturedProducts,
    ListProviderProducts,
    ListTodaysDeals,
)
from src.contexts.save.application.products import ListProducts
from src.contexts.save.application.collections import GetCollection, ListCollections
from src.contexts.save.application.providers import (
    CreateProvider,
    GetProvider,
    ListProviders,
    SetProviderLogo,
    UpdateProvider,
)
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.application.search import SearchProducts
from src.contexts.save.application.store_registry import (
    CreateSource,
    ListSourcesHealth,
    PauseSource,
    ResumeSource,
    UpdateSource,
)
from src.contexts.save.application.preview_basket_query import PreviewBasketQuery
from src.contexts.save.application.test_source import TestSource
from src.contexts.save.infrastructure.expo_push_sender import ExpoPushSender
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.repositories import (
    SqlAlertRepository,
    SqlBasketQueryRepository,
    SqlCanonicalProductRepository,
    SqlCollectionRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
    SqlStoreRegistryRepository,
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
    from src.contexts.aispace.flows.expense.categories import suggest_expense_categories
    from src.contexts.aispace.flows.expense.flow import build_expense_flow
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
    return build_graph(
        checkpointer,
        classifier=llm_classifier,
        registry=registry,
        flow_registry={"register_expense": expense_flow},
    )


# ── Save (catálogo de precios) ──
def get_search_products(session: Session = Depends(get_session)) -> SearchProducts:
    return SearchProducts(SqlCanonicalProductRepository(session))


def get_compare_product(session: Session = Depends(get_session)) -> CompareProduct:
    return CompareProduct(
        SqlCanonicalProductRepository(session),
        SqlStoreProductRepository(session),
        SqlTaxonomyRepository(session),
    )


def get_list_categories(session: Session = Depends(get_session)) -> ListCategories:
    return ListCategories(SqlTaxonomyRepository(session))


def get_category(session: Session = Depends(get_session)) -> GetCategory:
    return GetCategory(SqlTaxonomyRepository(session))


def get_list_providers(session: Session = Depends(get_session)) -> ListProviders:
    return ListProviders(SqlProviderRepository(session))


def get_provider(session: Session = Depends(get_session)) -> GetProvider:
    return GetProvider(SqlProviderRepository(session))


def get_create_provider(session: Session = Depends(get_session)) -> CreateProvider:
    return CreateProvider(SqlProviderRepository(session))


def get_update_provider(session: Session = Depends(get_session)) -> UpdateProvider:
    return UpdateProvider(SqlProviderRepository(session))


def get_set_provider_logo(session: Session = Depends(get_session)) -> SetProviderLogo:
    return SetProviderLogo(SqlProviderRepository(session))


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
    return ListSourcesHealth(SqlStoreRegistryRepository(session), SqlStoreProductRepository(session))


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
    )


def get_bulk_resolve_review(session: Session = Depends(get_session)) -> BulkResolveReview:
    return BulkResolveReview(
        scope=session,
        resolver=ResolveReview(SqlProductMatchRepository(session), SqlStoreProductRepository(session)),
    )
