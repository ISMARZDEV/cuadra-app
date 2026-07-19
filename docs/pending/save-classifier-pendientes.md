# Save · Clasificador de categoría — Pendientes

> **Contexto.** El clasificador quedó CODE-COMPLETE (rama `feat/save-fase3-fundaciones`, 3 commits):
> receta de embedding con términos descriptivos (top-1 vector **43%→77%**), generación offline de
> términos (LLM + bootstrap curado) y banding propio por **margen del vector** (sin trgm/RRF).
> Medición real end-to-end (léxico → vector+margen, juez off, 30 productos):
> **24/30 auto-clasificados · 22 correctos · 2 errores · 6 sin clasificar → 92% precisión, 73% recall.**
> Skill: `cuadra-save-classification`. Diseño/evidencia: `docs/sdd/save-category-classification.md`.
>
> Estos son los flecos conocidos, con su causa ya identificada. Ninguno bloquea Fase 3.

---

## 1. Los 2 errores son del LÉXICO, no del banding nuevo (follow-up de `lexicon.py`)

El banding por margen tuvo **0 errores** en la medición. Los 2 únicos fallos vienen de la etapa 1
(léxico determinista), por tokens que son **a la vez palabra común y nombre de categoría**:

| Producto | Clasificó (mal) | Token culpable |
|---|---|---|
| Detergente Ace **Polvo** 5 Lb | Bebidas En Polvo | `polvo` |
| Atún Calvo en **Agua** 5 Oz | Agua | `agua` |

**Causa.** `lexicon_match` asigna si el nombre pega tokens de UNA sola hoja. `polvo` mapea solo a
"Bebidas En Polvo" y `agua` solo a "Agua" (no son ambiguos por el criterio actual — que descarta un
token únicamente si mapea a >1 hoja), así que no se filtran y ganan con confianza 0.95.

**Fix (en `infrastructure/classification/lexicon.py`, NO en el banding):** manejar tokens que son
palabra genérica de producto. Opciones a evaluar (medir antes de elegir):
- stopwords de dominio (`agua`, `polvo`, `leche`, …) que no deben resolver por sí solos;
- exigir ≥2 tokens de la misma hoja para nombres largos;
- que la señal de **origen** (categoría de la tienda, Etapa B) desempate cuando el nombre es genérico.

**No tocar el banding del vector por esto** — funciona; el problema es upstream.

---

## 2. Afinar `CATEGORY_MARGIN_THRESHOLD` (hoy `0.03`) con más datos

El umbral de margen (top1−top2 del vector) sale de **solo 12 casos** (la etapa fuzzy de la medición).
Dio 100% de precisión ahí, pero es una muestra chica.

**Pendiente:** re-medir con un **labeled set** más grande (el curated basket sirve) y ajustar.
Tradeoff conocido: subirlo cambia recall por precisión; bajarlo arriesga un auto-clasificado malo
(territorio "habichuelas→Agua"). Vive en `infrastructure/classification/category_banding.py`, marcado
como provisional — mismo criterio que los umbrales del matching (`matching/cascade/banding.py`).

---

## 3. Correr el generador LLM real y compararlo contra el bootstrap curado

Hoy en dev está sembrado el **bootstrap curado** (`seeds/category_terms_data.py`, 120 hojas
hand-validadas, determinista, cero cuota) — es lo que da el 77% medido. El **generador LLM offline**
(`seeds/generate_category_terms.py` + `LlmCategoryTermsGenerator`) está construido y testeado pero
**no se corrió en vivo** (gasta cuota).

**Pendiente (otra sesión, con OK de cuota):** correr `python -m seeds.generate_category_terms` sobre
una taxonomía limpia (o hojas nuevas) y **comparar** el top-1 que producen sus términos contra el
bootstrap curado. Si iguala/supera, el LLM pasa a ser el camino de crecimiento para hojas futuras;
si no, el bootstrap curado se queda como fuente de verdad y el LLM solo asiste.

---

## Notas

- El **recall (73%)** no es el objetivo a maximizar: los 6 sin clasificar son el comportamiento
  correcto (regla sagrada — no inventar categoría). La palanca de recall real, si algún día se
  quiere, es encender el **juez de clasificación** (`SAVE_LLM_JUDGE_ENABLED`, hoy off por cuota) —
  distinto del juez del matching.
- Todo lo de arriba es DEUDA con causa raíz identificada, no bugs abiertos. Prioridad: baja; el
  clasificador es una necesidad de la UI de categorías (Fase 5), no del comparador.
