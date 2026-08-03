"""Tools de CATÁLOGO del GroceriesAgent: buscar, comparar, explorar alternativas, ranking.

Patrón (§5.1): una función `build_*` que cierra sobre `session_factory` y `market_id` y devuelve
la `@tool`. **`market_id` nunca es parámetro visible al LLM** — Save es catálogo público por
mercado, pero dejar que el modelo lo elija sería dejarle elegir el país.

Los docstrings están en INGLÉS a propósito: son literalmente el prompt con el que el modelo decide
qué tool llamar (skill `cuadra-agent-prompts`). Cada uno dice cuándo usarla **y cuándo no**.
"""
from __future__ import annotations

from langchain_core.tools import tool

from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.listing import ListBrandProducts
from src.contexts.save.application.search import SearchProducts
from src.contexts.save.domain.taxonomy import slugify
from src.contexts.save.infrastructure.matching.embeddings import build_api_embedder
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
    SqlTaxonomyRepository,
)
from src.config import settings

from ._shared import NO_MATCH, SessionFactory, money, price_metadata


def _find_node(nodes, slug: str):  # type: ignore[no-untyped-def]
    """Busca un nodo por slug en el árbol (recursivo). None si no existe."""
    for node in nodes:
        if node.slug == slug:
            return node
        found = _find_node(node.children, slug)
        if found is not None:
            return found
    return None


def _resolve(session, market_id: str, text: str):  # type: ignore[no-untyped-def]
    """Texto difuso del usuario → el canónico más probable. Devuelve None si no hay nada."""
    repo = SqlCanonicalProductRepository(session)
    results = SearchProducts(
        repo,
        embedding_provider=build_api_embedder(endpoint_url=settings.save_bge_m3_endpoint_url),
        limit=1,
    ).execute(text, market_id)
    return results[0] if results else None


def build_search_groceries(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def search_groceries(query: str) -> str:
        """Find supermarket products in the catalog by a fuzzy user phrase.

        Use it when the user names a product vaguely, misspells it, or uses a regional synonym
        ("arros", "habichuelas", "algo para sofreir") and you need to know WHICH products exist
        before doing anything else. Returns up to 5 ranked products with their id.

        Do NOT use it to get a price: it returns names, not prices. Once you know which product
        the user means, call compare_prices with that name.
        """
        with session_factory() as session:
            results = SearchProducts(
                SqlCanonicalProductRepository(session),
                embedding_provider=build_api_embedder(
                    endpoint_url=settings.save_bge_m3_endpoint_url
                ),
                limit=5,
            ).execute(query, market_id)
        if not results:
            return NO_MATCH
        return "\n".join(
            f"[{i}] {r.name} | brand={r.brand or 'unknown'} | id={r.slug}"
            for i, r in enumerate(results, start=1)
        )

    return search_groceries


def build_compare_prices(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def compare_prices(product: str) -> str:
        """Compare the price of ONE product across the supermarkets that carry it.

        Use it for "where is X cheapest?", "how much does X cost?", "price of X". This is the tool
        that answers any question about the price of a single product.

        It returns one line per store with the exact price, the unit price when the product
        declares a size, the store URL, the capture date and the price type. If the product is
        carried by only ONE store it says so explicitly — in that case never claim it is the
        cheapest, because there is nothing to compare it against.

        Do NOT use it for a whole shopping list (use basket_for_budget) or to browse a category
        (use cheapest_store_by_category).
        """
        with session_factory() as session:
            canonical = _resolve(session, market_id, product)
            if canonical is None:
                return NO_MATCH
            comparison = CompareProduct(
                SqlCanonicalProductRepository(session),
                SqlStoreProductRepository(session),
                SqlTaxonomyRepository(session),
            ).execute(canonical.slug, market_id)

            meta = price_metadata(session, comparison.canonical_product_id)
            lines = [f"product={comparison.name} | brand={comparison.brand}"]
            for entry in comparison.entries:
                parts = [
                    f"store={entry.provider_name}",
                    f"price={money(entry.price_minor, entry.currency)}",
                ]
                # Producto sin tamaño declarado (legítimo desde PR #45): se OMITE la línea de
                # precio por unidad en vez de imprimir un "RD$0.00/kg" que sería falso (§8.1).
                if entry.unit_price_minor is not None and entry.unit_measure:
                    parts.append(
                        f"unit_price={money(entry.unit_price_minor, entry.currency)}"
                        f"/{entry.unit_measure}"
                    )
                if entry.url:
                    parts.append(f"url={entry.url}")
                when, price_type = meta.get(entry.provider_id, ("unknown", "online"))
                parts.append(f"captured={when}")
                parts.append(f"price_type={price_type}")
                if len(comparison.entries) > 1 and entry.is_cheapest:
                    parts.append("cheapest=true")
                lines.append(" | ".join(parts))

            if len(comparison.entries) == 1:
                lines.append(
                    "note: found at only ONE store — there is nothing to compare it against, "
                    "so do NOT call it the best price"
                )
            else:
                lines.append(
                    f"spread={money(comparison.spread_minor, comparison.entries[0].currency)} "
                    f"between the cheapest and the most expensive"
                )
            lines.append("disclaimer: online prices, they may differ in store")
            return "\n".join(lines)

    return compare_prices


def build_explore_alternatives(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def explore_alternatives(product: str) -> str:
        """List other options for a product: other sizes and other products of the same brand.

        Use it for "what other options do I have?", "is the big package worth it?", "something
        similar but cheaper". Comparing the unit price across sizes is what reveals that a bigger
        package is NOT always cheaper per pound — say that only when the numbers show it.

        Do NOT use it to compare the SAME product across stores (that is compare_prices).
        """
        with session_factory() as session:
            canonical = _resolve(session, market_id, product)
            if canonical is None:
                return NO_MATCH
            cards = ListBrandProducts(
                SqlCanonicalProductRepository(session), SqlStoreProductRepository(session)
            ).execute(canonical.id, limit=8)
        if not cards:
            return f"no_alternatives: only {canonical.name} is in the catalog for that brand"
        lines = [f"alternatives_to={canonical.name}"]
        for card in cards:
            parts = [f"name={card.name}", f"price={money(card.price_minor, card.currency)}"]
            if card.unit_price_minor is not None and card.unit_measure:
                parts.append(
                    f"unit_price={money(card.unit_price_minor, card.currency)}/{card.unit_measure}"
                )
            lines.append(" | ".join(parts))
        lines.append(
            "note: compare by unit_price, not by absolute price; and say what you did NOT "
            "evaluate (taste, quality)"
        )
        return "\n".join(lines)

    return explore_alternatives


def build_cheapest_store_by_category(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def cheapest_store_by_category(category: str) -> str:
        """Rank the supermarkets by price WITHIN one category (rice, dairy, cleaning...).

        Use it for "which supermarket is cheaper for X?", "where should I buy my meat?". It
        answers the question behind the myth that one single supermarket is cheapest overall —
        each one usually wins in a different category.

        Report the ranking as conditioned: it covers only the stores and the products in the
        catalog, on the capture date, on absolute price. Do NOT use it for one product
        (compare_prices) nor for a whole budget (basket_for_budget).
        """
        # Se leen las filas producto×tienda CRUDAS, no `ListCategoryProducts`: su `ProductCardDto`
        # ya viene agregado al precio más barato entre tiendas, y acá justamente hace falta el
        # desglose POR tienda para poder rankearlas.
        with session_factory() as session:
            taxonomy = SqlTaxonomyRepository(session)
            node = _find_node(taxonomy.list_tree(market_id), slugify(category))
            if node is None:
                return f"no_match: '{category}' is not a category in the catalog"
            rows = SqlStoreProductRepository(session).list_category_offerings(
                taxonomy.descendant_ids(node.id)
            )

        totals: dict[str, list[int]] = {}
        products: set[str] = set()
        for row in rows:
            totals.setdefault(row.provider_name, []).append(row.price.amount_minor)
            products.add(row.product_id)
        if not totals:
            return f"no_data: no priced products in '{category}'"

        ranked = sorted(
            ((name, sum(p) // len(p), len(p)) for name, p in totals.items()),
            key=lambda row: row[1],
        )
        lines = [f"category={node.name} | products={len(products)}"]
        lines += [
            f"store={name} | average_price={money(avg)} | products_compared={count}"
            for name, avg, count in ranked
        ]
        lines.append(
            "note: this ranks by AVERAGE price over the products each store carries in this "
            "category — a store carrying fewer products is not directly comparable"
        )
        return "\n".join(lines)

    return cheapest_store_by_category
