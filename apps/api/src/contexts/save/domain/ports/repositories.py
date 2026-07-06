"""Puertos de repositorio de Save (ADR 31, DIP). `typing.Protocol` = interface estructural.

Las implementaciones SQLAlchemy viven en `infrastructure`. El dominio depende de estas
abstracciones, nunca de la infra. Inyectados por el composition_root.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol

from src.shared.money import Money

from ..alerts import Alert, AlertNotification, AlertSubscription
from ..comparison import StoreQuote
from ..drops import PriceChange
from ..entities import (
    CanonicalProduct,
    Collection,
    MatchCandidate,
    MatchCandidateSnapshot,
    PriceType,
    ProductMatch,
    Provider,
    StoreProduct,
)
from ..history import PricePoint
from ..listing import OfferingRow
from ..taxonomy import CategoryNode


class ProviderRepository(Protocol):
    def add(self, provider: Provider) -> None: ...
    def get_by_id(self, provider_id: str) -> Provider | None: ...
    def list_by_market(self, market_id: str) -> list[Provider]:
        """Providers del mercado, para el rail "Ofertas por supermercado" (A9)."""
        ...


class CollectionRepository(Protocol):
    """Colecciones curadas (A6). La pertenencia (M:N) se resuelve por `list_product_ids`."""

    def list_by_market(self, market_id: str) -> list[Collection]:
        """Colecciones del mercado, en orden de `position` (rails de la home)."""
        ...

    def get_by_slug(self, slug: str, market_id: str) -> Collection | None:
        """Resuelve una colección por su slug público (página propia)."""
        ...

    def list_product_ids(self, collection_id: str) -> list[str]:
        """canonical_product_id de la colección, en orden de `position` (hand-pick)."""
        ...


class TaxonomyRepository(Protocol):
    def list_tree(self, market_id: str) -> list[CategoryNode]:
        """Árbol de categorías del mercado (raíces con hijos anidados)."""
        ...

    def ancestors(self, node_id: str) -> list[CategoryNode]:
        """Camino raíz→nodo (inclusive) para el breadcrumb del producto."""
        ...

    def descendant_ids(self, node_id: str) -> list[str]:
        """IDs de `node_id` + todos sus descendientes (subárbol) — para el listado."""
        ...

    def list_products_under(self, node_id: str) -> list[CanonicalProduct]:
        """Productos canónicos cuyo nodo es `node_id` o un descendiente."""
        ...


class CanonicalProductRepository(Protocol):
    def add(self, product: CanonicalProduct) -> None: ...
    def get_by_id(self, product_id: str) -> CanonicalProduct | None: ...
    def get_by_slug(self, slug: str, market_id: str) -> CanonicalProduct | None: ...
    def search(self, query: str, market_id: str) -> list[CanonicalProduct]: ...
    def list_by_market(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[CanonicalProduct]:
        """Todos los productos del mercado (para el sitemap y el browse del portal)."""
        ...


class StoreProductRepository(Protocol):
    def exists(self, provider_id: str, external_id: str) -> bool:
        """¿Hay store_product para (provider, external_id)? — llave natural del refresh."""
        ...

    def list_quotes_by_canonical(self, canonical_product_id: str) -> list[StoreQuote]:
        """Cotizaciones (con nombre de tienda) para comparar — join a provider."""
        ...

    def list_category_offerings(self, node_ids: list[str]) -> list[OfferingRow]:
        """Filas producto×tienda para los productos bajo `node_ids` (listado por categoría)."""
        ...

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        """Filas producto×tienda de TODO el mercado (rails de la home)."""
        ...

    def record_observation(
        self,
        *,
        provider_id: str,
        external_id: str,
        canonical_product_id: str | None,
        price: Money,
        captured_at: datetime,
        price_type: PriceType,
        source: str,
        url: str | None = None,
        ean: str | None = None,
        name: str | None = None,
        brand: str | None = None,
        size_text: str | None = None,
        image_url: str | None = None,
    ) -> str:
        """Change-only (SCD-4): inserta `price` solo si cambió; si no, actualiza last_seen_at.

        `name`/`brand`/`size_text`/`image_url` (F2·B1, tarea 1.9-1.10) son los atributos CRUDOS
        del catálogo — se persisten tal cual llegan (se sobreescriben en cada observación cuando
        no son `None`), no participan en el change-only del precio.
        """
        ...

    def list_by_canonical(self, canonical_product_id: str) -> list[StoreProduct]: ...

    def link_to_canonical(self, store_product_id: str, canonical_product_id: str) -> None:
        """Escribe el FK denormalizado `store_product.canonical_product_id` (F2.0 matching).

        Invariante de la cascada (`MatchStoreProduct`): se llama SOLO junto al `product_match`
        correspondiente, en la MISMA transacción — el use case es el dueño de esa frontera.
        """
        ...

    def list_price_history(self, canonical_product_id: str) -> list[PricePoint]:
        """Puntos de cambio (change-only) de todas las tiendas, ordenados por captured_at."""
        ...

    def list_price_changes(self, market_id: str, since: datetime) -> list[PriceChange]:
        """Pares consecutivos previous→current cuyo cambio cae en la ventana (solo matcheados)."""
        ...


class AlertRepository(Protocol):
    """Alertas de precio (G4): suscripciones + feed de notificaciones disparadas."""

    def subscribe(
        self, user_id: str, canonical_product_id: str, market_id: str, threshold_minor: int | None
    ) -> str:
        """Suscribe (upsert por user×producto: re-suscribir actualiza el umbral). Devuelve el id."""
        ...

    def list_by_user(self, user_id: str) -> list[Alert]:
        """Suscripciones del usuario (con nombre de producto), más recientes primero."""
        ...

    def unsubscribe(self, user_id: str, alert_id: str) -> bool:
        """Elimina la suscripción si es del usuario. False si no existe/ajena."""
        ...

    def list_active_subscriptions(self, market_id: str) -> list[AlertSubscription]:
        """Todas las suscripciones activas del mercado (para el matching)."""
        ...

    def record_notification(
        self,
        *,
        alert_id: str,
        user_id: str,
        canonical_product_id: str,
        product_name: str,
        provider_name: str,
        previous_minor: int,
        current_minor: int,
        currency: str,
        drop_bps: int,
        captured_at: datetime,
    ) -> bool:
        """Inserta la notificación IDEMPOTENTE (alerta×tienda×captured_at). True si fue nueva."""
        ...

    def list_notifications(self, user_id: str) -> list[AlertNotification]:
        """Feed de alertas disparadas del usuario, más recientes primero."""
        ...

    def mark_notifications_read(self, user_id: str) -> int:
        """Marca leídas todas las notificaciones no leídas del usuario. Devuelve cuántas."""
        ...

    def register_push_token(self, user_id: str, token: str, platform: str) -> None:
        """Registra/actualiza el Expo push token de un dispositivo del usuario (upsert por token)."""
        ...

    def list_push_tokens(self, user_id: str) -> list[str]:
        """Tokens de push de todos los dispositivos del usuario (para el envío)."""
        ...


class EmbeddingProvider(Protocol):
    """Genera embeddings semánticos para la etapa vectorial de la cascada de matching (F2.0).

    Implementación concreta (BGE-M3 auto-hosteado) vive en infrastructure; el modelo está
    FIJO por despliegue — un cambio de modelo requiere una nueva implementación + backfill
    de `canonical_product.embedding` (no es un flag de config).
    """

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class ProductMatchRepository(Protocol):
    """Fuente de verdad del enlace store_product↔canonical_product (F2.0 matching)."""

    def record_match(
        self,
        *,
        store_product_id: str,
        canonical_product_id: str | None,
        confidence: float,
        method: str,
        status: str,
        judge_input_tokens: int | None = None,
        judge_output_tokens: int | None = None,
        judge_model: str | None = None,
    ) -> str:
        """Inserta/actualiza el `product_match` de `store_product_id` (UNIQUE). Devuelve el id.

        `judge_*` (F2·B1, tarea 1.13-1.14) es observabilidad de costo — solo lo pasa el caller
        en el camino grey-band/llm; se ignora (no pisa un valor previo) cuando llega `None`.
        """
        ...

    def find_candidates_by_ean(self, ean: str, market_id: str) -> list[MatchCandidate]:
        """Canonical_products YA enlazados que comparten este EAN en el mercado (score=1.0).

        Etapa 1 de la cascada (señal fuerte). 0 candidatos = sin match EAN (cae a léxico/semántico);
        1 candidato = enlace exacto; >1 canonical DISTINTO = colisión ambigua (a revisión humana,
        NO se autolinkea). No hay ranking real: el EAN es exacto, no aproximado.
        """
        ...

    def find_candidates_trgm(
        self, name: str, market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        """Candidatos por similitud léxica (pg_trgm) dentro del mercado, mejor primero."""
        ...

    def find_candidates_vector(
        self, embedding: list[float], market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        """Candidatos por similitud semántica (pgvector HNSW) dentro del mercado, mejor primero."""
        ...

    def list_review_queue(self, market_id: str) -> list[ProductMatch]:
        """Matches en `pending_review` del mercado, para la consola de administración."""
        ...

    def get_by_id(self, match_id: str) -> ProductMatch | None:
        """Recupera un `product_match` por id (incluye `store_product_id`) — lo usa
        `ResolveReview` (F2·B1) para conocer a qué store_product enlazar el FK antes de resolver."""
        ...

    def resolve_review(
        self,
        match_id: str,
        canonical_product_id: str | None,
        decided_by: str,
        *,
        reason_code: str | None = None,
        reason_note: str | None = None,
    ) -> None:
        """Resuelve un match pendiente (enlaza o rechaza) por decisión humana.

        Fuerza `method="human"` (la decisión ya no es de la cascada). `reason_code`/`reason_note`
        se persisten tal cual llegan (la validación de "reason_code requerido al rechazar" vive en
        el use case `ResolveReview`, no aquí — este método es I/O puro, ADR 31)."""
        ...

    def record_candidates(
        self, match_id: str, candidates: Sequence[MatchCandidateSnapshot]
    ) -> None:
        """Persiste el snapshot top-5 (por score, descendente) de candidatos ofrecidos al
        revisor para un `product_match` `pending_review` (F2·B1, tarea 1.11-1.12). El cap de
        top-5 se enforce AQUÍ (en código, no en la DB) aunque lleguen más candidatos. NUNCA se
        llama para un match `auto_linked` — lo decide el use case, no este método."""
        ...
