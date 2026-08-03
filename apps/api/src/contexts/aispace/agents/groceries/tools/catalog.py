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

from src.contexts.save.domain.search_ambiguity import is_ambiguous

from ._shared import NO_MATCH, SessionFactory, money, price_metadata


def _not_a_category(name: str) -> str:
    """Un nombre de PRODUCTO llegó a la tool de categorías: se redirige en vez de decir «nada».

    Decir `no_data` hacía que el modelo respondiera «no encontré precios» — una mentira, porque el
    producto SÍ está. El error no era del catálogo sino de la elección de tool.
    """
    return (
        f"wrong_tool: '{name}' is not a store section — it looks like a PRODUCT. "
        "Call compare_prices with it instead. Do NOT tell the user there are no prices."
    )


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


def _ambiguous_options(session, market_id: str, text: str) -> list[dict] | None:  # type: ignore[no-untyped-def]
    """Si la consulta nombra una FAMILIA y no un producto, devuelve las opciones para preguntar.

    La decisión vive en el dominio (`is_ambiguous`) y se toma sobre el score CRUDO de la etapa
    léxica — RRF comprime todo y no distingue una consulta ambigua de una específica.
    """
    repo = SqlCanonicalProductRepository(session)
    candidates = repo.search_lexical(text, market_id, limit=5)
    if not is_ambiguous([c.score for c in candidates]):
        return None
    products = {p.id: p for p in repo.get_many([c.canonical_product_id for c in candidates], market_id)}
    return [
        {"value": c.canonical_product_id, "label": products[c.canonical_product_id].name}
        for c in candidates
        if c.canonical_product_id in products
    ]


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


def build_compare_prices(  # type: ignore[no-untyped-def]
    session_factory: SessionFactory, market_id: str, staging: dict | None = None
):
    @tool
    def compare_prices(product: str) -> str:
        """Compare the price of ONE product across the supermarkets that carry it.

        Use it whenever X is a PRODUCT you could put in a cart: "arroz", "café Santo Domingo",
        "aceite", "leche", "pañales". "Where is X cheapest?", "how much does X cost?", "price of X".

        X is a PRODUCT, not a category. If the user names a whole SECTION of the store
        ("lácteos", "bebidas", "limpieza", "cuidado personal") use cheapest_store_by_category
        instead. When in doubt between the two, X is almost always a product — use this one.

        It returns one line per store with the exact price, the unit price when the product
        declares a size, the store URL, the capture date and the price type. If the product is
        carried by only ONE store it says so explicitly — in that case never claim it is the
        cheapest, because there is nothing to compare it against.

        Do NOT use it for a whole shopping list (use basket_for_budget) or to browse a category
        (use cheapest_store_by_category).
        """
        with session_factory() as session:
            # Ambigüedad → NO se adivina: se stagea la pregunta y el dock la hace (§5.4·A).
            # Comparar el producto equivocado es justo lo que el usuario detecta y castiga.
            if staging is not None:
                options = _ambiguous_options(session, market_id, product)
                if options:
                    staging["action"] = {
                        "requires_confirmation": True,
                        "kind": "disambiguate",
                        "summary": product,
                        "options": options,
                    }
                    # El prefijo importa: `ambiguous:` se leía como un error hermano de
                    # `no_match:` y el modelo respondía «no encontré nada». `found_several:`
                    # dice lo que de verdad pasó — hay DEMASIADO, no muy poco.
                    return (
                        f"found_several: there are {len(options)} products matching "
                        f"'{product}', and nothing the user said tells them apart. This is a "
                        "SUCCESS, not a failure. The app is ALREADY showing the user a picker "
                        "with the options. Reply with ONE short friendly line saying you found "
                        "several and to pick one. Do NOT list them. Do NOT ask a question — the "
                        "picker already asks."
                    )
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

        Use it ONLY when the user names a whole SECTION of the store, not a product: "lácteos",
        "bebidas", "limpieza", "cuidado personal", "snacks". It answers the myth that one single
        supermarket is cheapest overall — each one usually wins in a different section.

        "arroz", "café", "leche", "aceite" are PRODUCTS, not categories: for those use
        compare_prices. Calling this tool with a product name returns nothing useful.

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
                return _not_a_category(category)
            rows = SqlStoreProductRepository(session).list_category_offerings(
                taxonomy.descendant_ids(node.id)
            )

        totals: dict[str, list[int]] = {}
        products: set[str] = set()
        for row in rows:
            totals.setdefault(row.provider_name, []).append(row.price.amount_minor)
            products.add(row.product_id)
        if not totals:
            return _not_a_category(category)

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


def compare_by_canonical_id(  # type: ignore[no-untyped-def]
    session_factory: SessionFactory, market_id: str, canonical_product_id: str
) -> tuple[str, list[dict]]:
    """Comparación de un canónico YA elegido → (texto, ui_actions).

    Es el paso terminal del flujo de desambiguación (§5.4·A): el usuario ya tocó una pill, así que
    no hay nada que resolver — se compara ESE producto y se devuelven sus enlaces.
    """
    with session_factory() as session:
        repo = SqlCanonicalProductRepository(session)
        products = repo.get_many([canonical_product_id], market_id)
        if not products:
            return NO_MATCH, []
        comparison = CompareProduct(
            repo, SqlStoreProductRepository(session), SqlTaxonomyRepository(session)
        ).execute(products[0].slug or products[0].id, market_id)
        meta = price_metadata(session, comparison.canonical_product_id)

    lines = [f"{comparison.name} ({comparison.brand})"]
    ui_actions: list[dict] = []
    for entry in comparison.entries:
        when, price_type = meta.get(entry.provider_id, ("unknown", "online"))
        mark = " ← más barato" if entry.is_cheapest and len(comparison.entries) > 1 else ""
        lines.append(
            f"{entry.provider_name}: {money(entry.price_minor, entry.currency)}{mark}"
        )
        if entry.url:
            ui_actions.append(
                {"type": "link", "text": entry.provider_name, "href": entry.url}
            )
    lines.append(f"Precios en línea capturados el {when}; pueden variar en tienda.")
    return "\n".join(lines), ui_actions
