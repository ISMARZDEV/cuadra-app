"""Composition root de la cascada de matching F2.0 para la ingesta (SIN dagster).

Única fuente de verdad del wiring del matcher, compartida por los assets de Dagster
(`ingestion.save.assets`) y por el CLI ligero (`seeds.save_refresh`) — así ambos aplican
idéntico ship-dark gate y no divergen. Vive aquí (no en `assets.py`) para no arrastrar dagster
al CLI.
"""
from __future__ import annotations

import os
from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy.orm import Session

from src.config import settings
from src.shared.db.base import SessionLocal
from src.contexts.save.application.classify_backfill import ClassifyBackfill
from src.contexts.save.application.classify_store_product import ClassifyStoreProduct
from src.contexts.save.application.embed_canonical_products import EmbedCanonicalProducts
from src.contexts.save.application.embed_categories import EmbedCategories
from src.contexts.save.application.match_store_product import MatchStoreProduct
from src.contexts.save.application.refresh_prices import RefreshResult
from src.contexts.save.domain.ports import CatalogSource
from src.contexts.save.domain.ports.repositories import EmbeddingProvider
from src.contexts.save.infrastructure.classification.category_judge import CategoryJudge
from src.contexts.save.infrastructure.classification.lexicon import build_lexicon_index
from src.contexts.save.infrastructure.matching.llm_judge import LlmJudge
from src.contexts.save.infrastructure.matching.embeddings import (
    BgeM3EmbeddingProvider,
    SentenceTransformersEmbeddingProvider,
)
from src.contexts.save.infrastructure.matching.repository import SqlProductMatchRepository
from src.contexts.save.application.cover_canonicals import CoverCanonicals
from src.contexts.save.application.refresh_covered_prices import RefreshCoveredPrices
from src.contexts.save.application.refresh_prices import RefreshCatalogPrices
from src.contexts.save.infrastructure.catalog_sources.factory import (
    CatalogSourceFactory,
    directed_capability,
)
from src.contexts.save.infrastructure.catalog_sources.fetch_classifier import classify_httpx_error
from src.contexts.save.infrastructure.classification.relevance_gate import TaxonomyRelevanceGate
from src.contexts.save.infrastructure.catalog_sources.pacing import build_pace
from src.contexts.save.infrastructure.repositories import (
    SqlBasketQueryRepository,
    SqlCanonicalProductRepository,
    SqlCategoryCandidateRepository,
    SqlCategoryClassificationRepository,
    SqlCategoryIndexRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
    SqlStoreRegistryRepository,
    SqlTaxonomyRepository,
)


def select_queries(
    db_queries: Sequence[str], limit_env: str | None, limit: int | None = None
) -> tuple[str, ...]:
    """PURO: la canasta que ingiere = las queries de la TABLA `basket_query` (active, ya resueltas
    por el repo). La tabla es la ÚNICA fuente de verdad — ya NO hay fallback hardcodeado (el backfill
    vive en migración y la tabla se protege de los resets).

    Cadena de tope, en orden: **`limit` (la POLICY) → `SAVE_REFRESH_QUERY_LIMIT` (env) → sin tope.**

    `limit` es lo que el operador configuró desde el admin (`query_limit_override` → default global,
    resuelto por el dominio). Hasta que se cableó, ese campo no influía en NADA: la ingesta recortaba
    solo por la env y la policy se limitaba a persistirse — la misma mentira que `priority`, y con un
    formulario que ya la dejaba editar.

    La env NO se retira, y no es compatibilidad fantasma: `dagster-dev.sh` la exporta en 10, así que
    quitarla haría que dev saltara de 10 a las 213 queries de la canasta — 20x más requests REALES
    contra las APIs de los súper. Queda como red de seguridad cuando no hay nada configurado.

    `limit == 0` NO cae al fallback: es una decisión deliberada del operador (frenar esa fuente), y
    tratarlo como "sin configurar" la volvería a encender sola.
    """
    queries = tuple(db_queries)
    if limit is not None and limit >= 0:
        return queries[:limit]
    if limit_env and limit_env.isdigit() and int(limit_env) > 0:
        return queries[: int(limit_env)]
    return queries


def build_basket_queries(
    session: Session, market: str, limit: int | None = None
) -> tuple[str, ...]:
    """Canasta que consume la INGESTA: lee `basket_query WHERE active=true` del MERCADO (multi-país
    — cada mercado ingiere SU canasta, nunca market-blind).

    Vive acá y no en `assets.py` a propósito: los assets de Dagster y el CLI `seeds.save_refresh`
    tienen que leer la MISMA canasta. Mientras esto vivía junto a los assets (que importan dagster),
    el CLI no podía reusarlo y se llevaba un tuple hardcodeado en silencio — divergiendo de lo que
    el admin creía haber configurado.
    """
    active = SqlBasketQueryRepository(session).list_active(market)
    return select_queries(
        [q.query_text for q in active], os.getenv("SAVE_REFRESH_QUERY_LIMIT"), limit=limit
    )


def build_embedding_provider() -> EmbeddingProvider:
    """Elige el adapter de embeddings: si `SAVE_BGE_M3_ENDPOINT_URL` está seteado → endpoint HTTP
    (patrón de prod, servicio dedicado); si no → BGE-M3 in-process (sentence-transformers), para
    dev/batch chico. Mismo modelo en ambos → vectores comparables."""
    url = settings.save_bge_m3_endpoint_url
    return BgeM3EmbeddingProvider(url) if url else SentenceTransformersEmbeddingProvider()


def _build_category_index(
    session: Session, market_id: str
) -> tuple[dict[str, str], dict[str, str]]:
    """(lexicon token→hoja, mapa hoja→padre) para la señal de categoría del matcher (Etapa C).
    Derivado de la taxonomía sembrada (padres=nivel 0, hojas=nivel 1)."""
    tree = SqlTaxonomyRepository(session).list_tree(market_id)
    leaves = [(child.id, child.name) for root in tree for child in root.children]
    lexicon = build_lexicon_index(leaves)
    leaf_to_parent = {child.id: root.id for root in tree for child in root.children}
    return lexicon, leaf_to_parent


def build_relevance_gate(session: Session) -> TaxonomyRelevanceGate | None:
    """R2 (ship-dark): devuelve el relevance gate solo con `save_relevance_gate_enabled=true`.

    Deriva el FOOTPRINT del catálogo — las raíces top-level que ocupan los canónicos (`leaf_to_root`
    resuelve el nodo de cada canónico a su raíz; si ya es raíz, se usa tal cual). Sin canónicos
    clasificados no hay footprint → devuelve None (no-op): nunca descartar sin un scope conocido."""
    if not settings.save_relevance_gate_enabled:
        return None
    from ingestion.save.sources import SAVE_MARKET

    lexicon, leaf_to_root = _build_category_index(session, SAVE_MARKET)
    canonicals = SqlCanonicalProductRepository(session).list_by_market(SAVE_MARKET)
    footprint = frozenset(
        leaf_to_root.get(c.taxonomy_node_id, c.taxonomy_node_id)
        for c in canonicals
        if c.taxonomy_node_id
    )
    if not footprint:
        return None
    # Clasifica el producto a NUESTRA taxonomía por nombre+categoría (robusto al vocabulario de cada
    # tienda). Juez SIEMPRE off: la banda grey nunca descarta (conservador), así R2 no paga LLM.
    classifier = ClassifyStoreProduct(
        SqlCategoryClassificationRepository(session),
        SqlCategoryCandidateRepository(session),
        build_embedding_provider(),
        None,
        lexicon,
    )
    return TaxonomyRelevanceGate(
        classifier=classifier,
        leaf_to_root=leaf_to_root,
        footprint=footprint,
        market_id=SAVE_MARKET,
    )


def build_directed_adapter(source, provider, query):  # type: ignore[no-untyped-def]
    """Puerto `BuildAdapter` de PRODUCCIÓN para Loop B: construye el adapter real de la plataforma y
    lo apunta a la consulta dirigida (`for_query`). HTTP crudo (httpx) como el refresh normal — las
    fuentes son tiendas YA registradas (`store_registry`), no config admin ad-hoc (ese caso usa el
    SSRF-guard de `TestSource`)."""
    return CatalogSourceFactory.build(
        source.platform,
        source.base_url,
        endpoints=source.endpoints,
        headers=source.headers,
        auth=source.auth,
    ).for_query(provider.id, provider.market_id, query.text, by_ean=query.by_ean)


def build_cover_canonicals(session: Session) -> CoverCanonicals:
    """Compone Loop B (cobertura dirigida, F3.1): itera los (canónico×tienda) sin cubrir y delega en
    el MISMO pipeline de refresh (record + cascada) con adapters dirigidos. Comparte la `session`
    (misma UoW que el matcher, por el invariante FK+product_match)."""
    store_repo = SqlStoreProductRepository(session)
    refresh = RefreshCatalogPrices(
        store_repo, matcher=build_matcher(session), classifier=build_classifier(session)
    )
    return CoverCanonicals(
        store_repo=store_repo,
        canonical_repo=SqlCanonicalProductRepository(session),
        source_repo=SqlStoreRegistryRepository(session),
        provider_repo=SqlProviderRepository(session),
        refresh=refresh,
        build_adapter=build_directed_adapter,
        classify_error=classify_httpx_error,  # F3.3: 503/timeout → abortar la tienda (no martillarla)
        # Capacidad REAL por fuente (no la heurística por plataforma): habilita Loop B en las REST
        # cuyo profile declara lookup por barcode — Bravo (`model.filterByEan`, 2026-07-15).
        capability_of=lambda source: directed_capability(source.platform, source.endpoints),
        # Rate limiting de salida (SRD `scrape-many.ts`): el round-robin SOLO reordena — con una
        # tienda es un no-op. Loop B pega UNA vez por canónico: sin pausa, es un 429 asegurado.
        pace=build_pace(),
    )


def build_refresh_known_prices(session: Session) -> RefreshCoveredPrices:
    """Compone `price_refresh` (paridad Prices Batch de SRD): re-precia por id TODO lo CONOCIDO y viejo
    (matcheado O en revisión), no solo lo cubierto. Mismo camino A + fallback C + F3.3 que la frescura —
    solo cambia el conjunto (`list_stale_known`)."""
    return build_refresh_covered_prices(session, known=True)


def build_refresh_covered_prices(session: Session, *, known: bool = False) -> RefreshCoveredPrices:
    """Compone F3.2a (frescura): camino A (re-fetch por id/url/source_ref → change-only, SIN matcher)
    + fallback C (browse por provider diferido, §15.4). Reusa F3.3 (abort-on-down vía
    classify_httpx_error). Cachea los registries del mercado (1 query). `known=True` (para `price_refresh`)
    amplía el conjunto de covered-only a TODO lo conocido con locator (`list_stale_known`)."""
    from src.contexts.save.domain.entities import SourcePlatform

    from ingestion.save.sources import SAVE_MARKET  # local: evita import circular (patrón del módulo)

    store_repo = SqlStoreProductRepository(session)
    refresh = RefreshCatalogPrices(store_repo, matcher=None, classifier=None)
    registries = {
        r.provider_id: r
        for r in SqlStoreRegistryRepository(session).list_by_market(SAVE_MARKET)
    }

    def _builder(provider_id):  # type: ignore[no-untyped-def]
        reg = registries.get(provider_id)
        if reg is None:
            return None
        return CatalogSourceFactory.build(
            reg.platform, reg.base_url, endpoints=reg.endpoints, headers=reg.headers, auth=reg.auth
        )

    def build_detail_source(item):  # type: ignore[no-untyped-def]
        builder = _builder(item.provider_id)
        if builder is None:
            return None
        try:
            return builder.for_detail(item.provider_id, SAVE_MARKET)  # camino A
        except ValueError:
            return None  # plataforma sin ProductDetailSource → el use-case cae al browse (C)

    def build_browse_source(provider_id):  # type: ignore[no-untyped-def]
        # Solo REST_CATALOG tiene "browse completo" como refresh (VTEX/Magento son query-based).
        reg = registries.get(provider_id)
        if reg is None or reg.platform is not SourcePlatform.REST_CATALOG:
            return None
        return _builder(provider_id).for_query(provider_id, SAVE_MARKET, "")  # REST ignora la query → browse

    def build_recovery_source(item, ean):  # type: ignore[no-untyped-def]
        """F3.2b (B): el localizador murió → repreguntarle a la tienda por el barcode del canónico.
        Solo donde la búsqueda matchea por EAN (`by_ean`): sin barcode no hay llave determinista y
        recuperar por nombre es Fase 2 (propuesta a un humano), nunca automático."""
        reg = registries.get(item.provider_id)
        if reg is None:
            return None
        cap = directed_capability(reg.platform, reg.endpoints)
        if not (cap.supported and cap.by_ean):
            return None
        return _builder(item.provider_id).for_query(
            item.provider_id, SAVE_MARKET, ean, by_ean=True
        )

    return RefreshCoveredPrices(
        store_repo=store_repo,
        refresh=refresh,
        build_detail_source=build_detail_source,
        build_browse_source=build_browse_source,
        classify_error=classify_httpx_error,
        stale_source=store_repo.list_stale_known if known else None,
        build_recovery_source=build_recovery_source,
        # `price_refresh` pide el /get de CADA producto conocido contra UNA tienda → el caso exacto
        # donde el intercalado no protege. Verificado en vivo: Bravo responde 429.
        pace=build_pace(),
    )


def _is_active(reg) -> bool:  # type: ignore[no-untyped-def]
    """El gate MANUAL del admin (`enabled` / `paused_at`). Existía desde F2·B1 y la ingesta por-query
    lo ignoraba por completo: el set de fuentes era un tuple hardcodeado que no consultaba nada, así
    que pausar una tienda desde la consola no la sacaba de la ingesta."""
    return reg.enabled and reg.paused_at is None


def query_catalog_partition_keys(session: Session) -> list[str]:
    """`provider_id` de cada fuente ACTIVA que sabe buscar por TEXTO — las particiones dinámicas del
    asset `query_catalog_prices` (Descubrimiento / Loop A dirigido por la canasta).

    R1: reemplaza `SOURCE_KEYS = ("sirena","nacional","jumbo")`. El set se DERIVA del registry, así
    que sumar un súper es una FILA, no un deploy (regla SAGRADA #4), y `enabled`/`paused_at` por fin
    significan algo para la ingesta.

    La capacidad se pregunta a `directed_capability` (infra) y no a la plataforma: `REST_CATALOG` es
    un adapter genérico y cada súper decide qué expone — una plataforma no puede responder por todos
    sus profiles. Así **Bravo entra solo** (su profile declara `text_param` desde el desbloqueo
    2026-07-16) y un REST browse-only queda fuera, que es el gate que impide mandarle las 213 queries
    de la canasta a una fuente que las ignora y navegarle el catálogo entero 213 veces.
    """
    from ingestion.save.sources import SAVE_MARKET  # local: evita import circular (patrón del módulo)

    return [
        reg.provider_id
        for reg in SqlStoreRegistryRepository(session).list_by_market(SAVE_MARKET)
        if _is_active(reg) and directed_capability(reg.platform, reg.endpoints).by_text
    ]


def build_query_catalog_sources_for(
    session: Session, provider_id: str, queries: tuple[str, ...]
) -> list[CatalogSource] | None:
    """Un adapter por query de la canasta para UNA fuente — el partitioned asset materializa UN
    proveedor por partición. `None` si la fuente ya no existe, la apagaron, o dejó de saber por texto
    (partición huérfana → el asset la salta sin fallar).

    Re-chequea el gate en vez de confiar en la partición: el sensor tarda hasta 5 min en limpiar, y
    materializar a mano NO debe ingerir una tienda que el admin apagó.
    """
    from ingestion.save.sources import SAVE_MARKET

    reg = SqlStoreRegistryRepository(session).get_by_provider_id(provider_id)
    if reg is None or not _is_active(reg):
        return None
    if not directed_capability(reg.platform, reg.endpoints).by_text:
        return None
    builder = CatalogSourceFactory.build(
        reg.platform, reg.base_url, endpoints=reg.endpoints, headers=reg.headers, auth=reg.auth,
    )
    # `for_query` rutea por plataforma: VTEX/Magento por su param de búsqueda, REST_CATALOG al
    # `/search` del profile (Bravo: `showOrder=score`). El `Store: jumbo` sale de `headers` en `build`.
    return [builder.for_query(reg.provider_id, SAVE_MARKET, q) for q in queries]


def rest_catalog_partition_keys(session: Session) -> list[str]:
    """Claves de partición (`{provider_id}:{section}`) de TODAS las fuentes REST_CATALOG del mercado —
    lo que el sensor sincroniza con las particiones dinámicas del asset `rest_catalog_prices`. Filtra a
    REST_CATALOG (VTEX/Magento son query-based, tienen su propio asset). Registry-driven (regla SAGRADA
    #4). Vacío si no hay ninguna configurada."""
    from src.contexts.save.domain.entities import SourcePlatform

    from ingestion.save.sources import SAVE_MARKET  # local: evita import circular (patrón del módulo)

    keys: list[str] = []
    for reg in SqlStoreRegistryRepository(session).list_by_market(SAVE_MARKET):
        if reg.platform is not SourcePlatform.REST_CATALOG:
            continue
        for section in (reg.endpoints or {}).get("sections") or []:
            keys.append(rest_catalog_partition_key(reg.provider_id, section))
    return keys


# Clave de partición del asset `rest_catalog_prices`: `{provider_id}:{section}`. La sección sola NO es
# única entre proveedores (dos súper REST podrían usar la misma), así que el provider va en la clave —
# el asset necesita saber DE QUÉ fuente es la sección (base_url/endpoints/auth).
_PARTITION_SEP = ":"


def rest_catalog_partition_key(provider_id: str, section: str) -> str:
    return f"{provider_id}{_PARTITION_SEP}{section}"


def parse_rest_catalog_partition_key(key: str) -> tuple[str, str]:
    """`{provider_id}:{section}` → (provider_id, section). `rsplit` con tope 1: los UUID no tienen `:`
    y las secciones son numéricas, así que el último `:` separa bien aunque el provider fuera raro."""
    provider_id, section = key.rsplit(_PARTITION_SEP, 1)
    return provider_id, section


def build_rest_catalog_source_for(
    session: Session, provider_id: str, section: str
) -> CatalogSource | None:
    """UN adapter de browse REST_CATALOG para (provider, section) — el partitioned asset materializa
    UNA sección por partición. `None` si la fuente no existe o dejó de ser REST_CATALOG (partición
    huérfana → el asset la salta)."""
    from src.contexts.save.domain.entities import SourcePlatform

    from ingestion.save.sources import SAVE_MARKET

    reg = SqlStoreRegistryRepository(session).get_by_provider_id(provider_id)
    if reg is None or reg.platform is not SourcePlatform.REST_CATALOG:
        return None
    builder = CatalogSourceFactory.build(
        reg.platform, reg.base_url,
        endpoints={**(reg.endpoints or {}), "sections": [section]},
        headers=reg.headers, auth=reg.auth,
    )
    return builder.for_query(reg.provider_id, SAVE_MARKET, "")  # REST ignora la query → browse


def build_matcher(session: Session) -> MatchStoreProduct | None:
    """Devuelve un matcher REAL solo cuando `SAVE_MATCHING_CASCADE_ENABLED` está activo — la
    cascada se despliega DARK hasta bootstrapear la canasta curada. Comparte la `session` (misma
    UoW/transacción que el refresh, para el invariante FK+product_match). None = legacy F1
    (desconocidos descartados).

    Etapa C: cuando `SAVE_CLASSIFICATION_ENABLED` también está activo, inyecta la señal de categoría
    (lexicon + mapa hoja→padre) — boost por misma hoja + gate por padre distinto. Sin ella el
    matcher se comporta idéntico a antes."""
    if not settings.save_matching_cascade_enabled:
        return None
    from ingestion.save.sources import SAVE_MARKET

    category_lexicon = leaf_to_parent = None
    if settings.save_classification_enabled:
        category_lexicon, leaf_to_parent = _build_category_index(session, SAVE_MARKET)
    return MatchStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
        canonical_repo=SqlCanonicalProductRepository(session),
        embedding_provider=build_embedding_provider(),
        # Switch preventivo (`SAVE_LLM_JUDGE_ENABLED=false`): sin juez, la banda gris va directo
        # a revisión. El EAN y la banda alta siguen auto-enlazando sin tocar la API.
        judge=LlmJudge() if settings.save_llm_judge_enabled else None,
        category_lexicon=category_lexicon,
        leaf_to_parent=leaf_to_parent,
    )


def build_canonical_embedder(session: Session) -> EmbedCanonicalProducts | None:
    """Backfill del índice semántico: embebe los canónicos sin embedding ANTES del matching, para
    que la etapa vectorial tenga contra qué matchear. Mismo gate (`SAVE_MATCHING_CASCADE_ENABLED`)
    y MISMO modelo que `build_matcher` (vectores comparables). `None` cuando la cascada está dark."""
    if not settings.save_matching_cascade_enabled:
        return None
    return EmbedCanonicalProducts(
        SqlCanonicalProductRepository(session),
        build_embedding_provider(),
    )


def _build_lexicon(session: Session, market_id: str):  # type: ignore[no-untyped-def]
    """Índice léxico keyword→hoja para el market de ingesta, derivado de la taxonomía sembrada
    (subcategorías = nivel 1). Ingesta single-market (`SAVE_MARKET`); multi-market = F3."""
    tree = SqlTaxonomyRepository(session).list_tree(market_id)
    leaves = [(child.id, child.name) for root in tree for child in root.children]
    return build_lexicon_index(leaves)


def build_classifier(session: Session) -> ClassifyStoreProduct | None:
    """Clasificador de categoría REAL solo cuando `SAVE_CLASSIFICATION_ENABLED` está activo (ship-dark).
    Comparte la `session` del refresh. Reusa `build_embedding_provider` (mismo BGE-M3) y el juez LLM.
    `None` = dark (la ingesta no clasifica)."""
    if not settings.save_classification_enabled:
        return None
    from ingestion.save.sources import SAVE_MARKET

    return ClassifyStoreProduct(
        SqlCategoryClassificationRepository(session),
        SqlCategoryCandidateRepository(session),
        build_embedding_provider(),
        # Mismo switch preventivo que el matcher: sin juez, la banda gris no clasifica en vez de
        # llamar a una API que sabemos que no queremos usar. El léxico sigue clasificando gratis.
        CategoryJudge() if settings.save_llm_judge_enabled else None,
        _build_lexicon(session, SAVE_MARKET),
    )


def build_category_embedder(session: Session) -> EmbedCategories | None:
    """Backfill del índice semántico de CATEGORÍAS: embebe las hojas sin embedding ANTES de clasificar,
    para que `find_leaves_vector` tenga contra qué comparar. Mismo gate y modelo que `build_classifier`."""
    if not settings.save_classification_enabled:
        return None
    return EmbedCategories(SqlCategoryIndexRepository(session), build_embedding_provider())


def build_classify_backfill(session: Session) -> ClassifyBackfill | None:
    """Backfill de clasificación (job): clasifica lo existente sin `active`. Mismo gate ship-dark."""
    classifier = build_classifier(session)
    if classifier is None:
        return None
    return ClassifyBackfill(SqlCategoryClassificationRepository(session), classifier)


def resolve_query_limit(session: Session, provider_id: str, market: str) -> int | None:
    """Tope de queries que el ADMIN configuró para este provider-flow, o `None` si no configuró
    ninguno (→ la ingesta cae a la env y, si tampoco, ingiere la canasta entera).

    La precedencia (`override → default global`) vive en el DOMINIO
    (`OrchestrationPolicy.query_limit_effective`); acá solo se cargan las dos piezas. Duplicar la
    regla en la ingesta la desincronizaría de lo que la consola muestra como `resolved_query_limit`.

    Sin policy para ese proveedor tampoco se inventa nada: `None`.
    """
    from src.contexts.save.domain.entities.orchestration import FlowKey
    from src.contexts.save.infrastructure.orchestrator.policy_repository import (
        SqlOrchestrationGlobalConfigRepository,
        SqlOrchestrationPolicyRepository,
    )

    policy = SqlOrchestrationPolicyRepository(session).find_active(
        provider_id=provider_id,
        market_id=market,
        flow_key=FlowKey.PROVIDER_PRICES_REFRESH.value,
    )
    if policy is None:
        return None
    return policy.query_limit_effective(SqlOrchestrationGlobalConfigRepository(session).get(market))


def build_progress_recorder(
    *,
    run_id: str,
    market: str,
    provider_id: str | None = None,
    policy_id: str | None = None,
    flow_key: str | None = None,
    session_factory: Callable[[], Any] = SessionLocal,
) -> Callable[[int, int, RefreshResult], None]:
    """Callback de progreso que persiste el snapshot en CADA query (§14 #14, segunda mitad).

    Antes `on_progress` solo escribía al log de Dagster y el snapshot se grababa UNA vez al terminar:
    durante la corrida no existía fila para ese `run_id`, así que la consola no tenía qué mostrar y
    la barra aparecía recién al final, siempre al 100%. Una barra que solo se ve cuando ya no hay
    progreso que mirar.

    **Sesión PROPIA, que commitea sola.** El snapshot final viaja en la transacción de la ingesta (a
    propósito: si el refresh se revierte, sus métricas no quedan huérfanas), pero esa transacción
    commitea al final — o sea, invisible en vivo. El progreso necesita commitear aparte.

    Efecto secundario deseable: si la corrida MUERE, la fila de progreso sobrevive al rollback y
    queda registrado "murió en la query 7 de 213". Eso es forense, no basura.

    Una falla escribiendo el progreso NO tumba la corrida: perder observabilidad es molesto, perder
    la ingesta es caro. Es lo único que este callback puede romper, así que no puede romper nada.
    """
    from src.contexts.save.domain.entities.orchestration_run import RunMetrics
    from src.contexts.save.infrastructure.orchestrator.run_snapshot_repository import (
        SqlRunSnapshotRepository,
    )

    def on_progress(index: int, total: int, acc: RefreshResult) -> None:
        del index, total  # el acumulado ya trae los dos contadores, puestos por el runner
        try:
            with session_factory() as session:
                SqlRunSnapshotRepository(session).record(
                    dagster_run_id=run_id,
                    market_id=market,
                    metrics=RunMetrics(
                        seen=acc.seen,
                        refreshed=acc.refreshed,
                        unmatched=acc.unmatched,
                        matched=acc.matched,
                        discarded=acc.discarded,
                        auto_linked=acc.auto_linked,
                        queued_for_review=acc.queued_for_review,
                        queries_total=acc.queries_total,
                        queries_processed=acc.queries_processed,
                    ),
                    provider_id=provider_id,
                    policy_id=policy_id,
                    flow_key=flow_key,
                )
                session.commit()
        except Exception:  # noqa: BLE001 — ver el docstring: no puede tumbar la corrida
            pass

    return on_progress
