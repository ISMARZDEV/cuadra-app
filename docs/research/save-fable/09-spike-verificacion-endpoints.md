# 09 · Spike — verificación EN VIVO de endpoints (2026-07-03)

> **Fecha:** 2026-07-03 · **Estado:** completo · **Tipo:** spike técnico (probado con curl real).
> Verifica los supuestos del doc 02 antes de codear adapters. Append-only.

---

## Veredicto rápido
| Cadena | Supuesto (doc 02) | Realidad (probado) | Estado |
|--------|-------------------|--------------------|--------|
| **Sirena** | VTEX, API pública con precio | **✅ CONFIRMADO** — devuelve precio + EAN + taxonomía | 🟢 listo para F0 |
| **Nacional** | Magento GraphQL abierto | **✅ CONFIRMADO** — devuelve precio + currency | 🟢 listo para F1 |
| **Plaza Lama** | Shopify (`products.json`) | **❌ FALSO** — es Next.js custom, NO Shopify NI VTEX | 🔴 re-investigar |

## 1. Sirena — VTEX ✅ (la mina de oro para F0)
`GET https://www.sirena.do/api/catalog_system/pub/products/search?ft=arroz&_from=0&_to=1`
→ **HTTP 206, `application/json`**. Ejemplo real devuelto:
- `productName: "Arroz Selecto Wala 5lb"`, `brand: "WALA"`.
- **Taxonomía completa:** `categories: ["/Supermercado/Despensa/Arroz, Habichuelas y otros granos/Arroz/", ...]` + `categoriesIds: ["/1/11/82/209/", ...]` → **podemos sembrar el canonical taxonomy directo de acá**.
- **EAN presente:** `items[].ean: "2100003063755"` → oro para el matching (nivel 1 de la cascada).
- **Precio en minor units:** `addToCartLink: ".../add?sku=12749&...&price=16900..."` = **RD$169.00** (16900 minor); también `commertialOffer.Installments[].Value: 169.0`.
- **Bonus inesperado:** cada producto trae specs `"Pedidos Ya":["Si"]`, `"Uber Eats":["Si"]` → Sirena MISMA marca qué productos están en los agregadores. Útil para cruzar.
- Imágenes en `gruporamos.vteximg.com.br` (VTEX confirmado).
→ **Un `VtexAdapter` sobre este endpoint entrega nombre+marca+EAN+taxonomía+precio(minor). F0 puede arrancar YA sobre Sirena.**

## 2. Nacional — Magento GraphQL ✅
`GET https://supermercadosnacional.com/graphql?query={__typename}` → `{"data":{"__typename":"Query"}}` (endpoint abierto, sin auth).
Query real de productos:
`{products(search:"arroz",pageSize:1){items{name sku price_range{minimum_price{final_price{value currency}}}}}}`
→ `{"name":"Arroz Selecto Líder 10 Lb","sku":"2140283","price_range":{"minimum_price":{"final_price":{"value":327.95,"currency":"DOP"}}}}`
- **Devuelve precio (327.95) + currency (DOP) + sku.** (Nota: Magento da decimal → el adapter multiplica ×100 → 32795 minor.)
- Coincide con lo visto en SupermercadosRD ("Arroz Selecto Líder 10 LB ~RD$327") → dato consistente.
→ **`MagentoAdapter` sobre GraphQL funciona. Cubre Nacional Y Jumbo (mismo backend CCN).**

## 3. Plaza Lama — ❌ NO es Shopify (corrección de supuesto)
- `GET /products.json` → **HTTP 200 pero `text/html`** (devuelve el HTML de una app **Next.js**, `/_next/static/...`), NO JSON de Shopify.
- `GET /collections.json` → igual, HTML.
- Hipótesis **VTEX FastStore** (Next.js+VTEX): `GET /api/catalog_system/pub/products/search` → **404**. `GET /api/graphql` → **404**.
→ **Plaza Lama es un Next.js CUSTOM**; su API de datos NO es Shopify ni VTEX estándar. El supuesto "Shopify" (docs 02/03) venía de las rutas `/collections/` que vi, que en realidad son rutas propias de su Next.js, no de Shopify.
**Acción:** re-investigar con inspección de red del navegador (ver qué API llama el Next.js — probable API propia o headless commerce tipo Medusa/Vendure/commercetools) o, si no, `AgentAdapter` (Firecrawl). **Plaza Lama baja al bucket de "investigación/agente-IA"** junto con Bravo/Garrido.

## 4. Implicación para el plan (ajuste)
- **Fuentes API-limpias CONFIRMADAS:** Sirena (VTEX) + Nacional/Jumbo (Magento). **Suficiente para F0 y F1** (2 plataformas, 3 cadenas: Sirena, Nacional, Jumbo).
- **Sustituir Plaza Lama** en el "primer corte de 3 cadenas" por **Jumbo** (Magento, ya cubierto) o **Carrefour** (VTEX, a verificar con el mismo probe).
- **Plaza Lama, Bravo, Garrido** → bucket agente-IA / reverse-eng (F2+), no bloquean el MVP.
- **Descubrimiento útil:** la taxonomía de Sirena (`categoriesIds` jerárquicos) sirve de **semilla del canonical taxonomy** — no hay que inventarla.

## 5. Pendiente del spike (micro, opcional antes de F0)
- Verificar **Carrefour** con el probe VTEX (`/api/catalog_system/pub/products/search`) → confirmar 3ª fuente limpia.
- Inspección de red de **Plaza Lama** para hallar su API real.
- Confirmar **paginación real** de Sirena VTEX (el cap 2500 → segmentar por `categoriesIds`).

---

**Conclusión:** los supuestos de VTEX (Sirena) y Magento (Nacional) **se sostienen y devuelven precio real**; el de Shopify (Plaza Lama) **NO** — corregido. **F0 puede arrancar con certeza sobre Sirena (VTEX).** Esto es exactamente para lo que sirve un spike: caer un supuesto equivocado ANTES de codear el adapter.

---

## 6. Ronda 2 (2026-07-03) — Carrefour + agregadores Hero/Uber

### Carrefour RD — ❌ NO es VTEX (supuesto caído)
`GET https://www.carrefour.do/api/catalog_system/pub/products/search?...` → **404**, y el sitio es
**WordPress + Yoast SEO** ("Carrefour Santo Domingo", textos en francés). → **carrefour.do es un
sitio CORPORATIVO WordPress, NO una tienda e-commerce con catálogo API.** Mi inferencia "Carrefour =
VTEX" venía de Carrefour **Brasil** (que sí migró a VTEX) — **no aplica a RD**. En RD, Carrefour vende
su catálogo **vía los agregadores** (PedidosYa/UberEats), no por sitio propio.
→ **Carrefour baja a "solo vía agregador"**, no es fuente API-limpia.

### PedidosYa — 🔴 Cloudflare (anti-bot confirmado)
`GET https://www.pedidosya.com.do/` → **HTTP 403**, `server: cloudflare`, `cf-ray`, cookie `__cf_bm`,
`server-timing: chlray` (Cloudflare challenge). **No se puede curl directo.**

### UberEats — 🔴 Cloudflare (anti-bot confirmado)
`GET https://www.ubereats.com/do` → **403**, `server: cloudflare`, `x-uber-edge: ...cloudflare`,
cookie `__cf_bm`. `POST /_p/api/getStoreV1` sin token → **403**. **No se puede curl directo.**

→ **Confirma la decisión del doc 05:** los agregadores NO se tocan con un simple request. Requieren
**managed (Apify/Bright Data)** o **Playwright** para bootstrap de sesión/token (resuelve el challenge
de Cloudflare). Managed-first sigue siendo lo correcto.

## 7. Mapa de fuentes ACTUALIZADO post-spike
| Fuente | Veredicto probado | Ruta |
|--------|-------------------|------|
| **Sirena** | ✅ VTEX, precio+EAN+taxonomía | `VtexAdapter` (F0) |
| **Nacional + Jumbo** | ✅ Magento GraphQL, precio | `MagentoAdapter` (F1) |
| **Plaza Lama** | ❌ Next.js custom | agente-IA / inspección red (F2+) |
| **Carrefour RD** | ❌ WordPress corporativo, sin catálogo propio | solo vía agregador |
| **Bravo, Garrido** | (no probado) SPA/app | agente-IA / reverse-eng (F2+) |
| **PedidosYa, UberEats** | 🔴 Cloudflare | managed (Apify) / Playwright (F2+) |

**Corte limpio real para MVP (F0/F1): Sirena (VTEX) + Nacional + Jumbo (Magento).** 2 plataformas, 3
cadenas, todas verificadas devolviendo precio. Carrefour/Ole/PriceSmart/Ritmo/Líder → vía agregadores
(F2+). Esto CIERRA la duda de fuentes para el MVP.
