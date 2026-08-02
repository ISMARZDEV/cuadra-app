# Taxonomía multi-país / multi-idioma

Estado: **Fase 1 IMPLEMENTADA** (2026-08-01, migración `a3f8d1c05e72`). Fase 2 sigue siendo diseño
y es especulativa hasta que exista un segundo mercado.

> **Corrección de diseño durante la implementación.** El borrador decía que el id derivaría de la
> key (`uuid5(key)`). **No se hizo así**, y a propósito: si el id deriva de la key, renombrar una
> key rompe la identidad — el mismo bug un nivel más arriba, y encima congelaría para siempre las
> keys en español que se generaron por slug. Lo construido: la key es la **llave de búsqueda** del
> seed y el id es **opaco** (se calcula sólo al nacer el nodo). Corregir una key después —incluido
> traducirlas todas al inglés— es un UPDATE de una columna de texto, sin churn de ids ni orfanatos.

## El problema

Hoy la taxonomía está atada al español dominicano en tres lugares distintos, y sólo uno de ellos
*debe* estarlo.

```python
# seeds/save_seed.py::_taxonomy_leaf
node_id = uuid.uuid5(_NS, f"taxonomy:{market}/{categoria}/{subcategoria}")
```

El **id deriva del nombre en español y del mercado**. Eso mezcla tres cosas que tienen ciclos de
vida distintos:

| Qué | ¿Depende del idioma? | ¿Depende del mercado? | Hoy vive en |
|---|---|---|---|
| **Concepto** ("arroz, granos y legumbres") | NO | NO | el id, derivado del nombre ES |
| **Etiqueta** ("Arroz, Granos & Legumbres") | SÍ | a veces | `taxonomy_node.name` |
| **Reconocimiento** (`classification_terms`, `embedding`) | SÍ | SÍ | `taxonomy_node` |

Las consecuencias no son teóricas:

1. **Renombrar rompe la identidad.** Corregir una etiqueta genera un nodo NUEVO y deja huérfano el
   viejo. Lo pagamos hoy: 10 renames → 10 nodos huérfanos que hubo que borrar a mano. Fue barato
   porque la base estaba en baseline; con catálogo vivo habría orfanado clasificaciones y canónicos.
2. **Un mercado nuevo = un árbol nuevo y ajeno.** Sembrar `US` produce ids distintos para los mismos
   conceptos. "Dairy & Eggs" y "Lácteos & Huevos" serían nodos sin ninguna relación.
3. **Sin comparación entre países.** "¿Cómo se movió el precio del arroz en DO vs BR?" no se puede
   responder a nivel categoría si cada país tiene su propio id para el mismo concepto.
4. **La curación se multiplica.** Cada árbol se mantiene por separado y derivan entre sí.

Y una precisión sobre el front: las etiquetas de categoría **son datos**, no i18n. El bundle
(`apps/web/src/i18n/messages.ts`) tiene el chrome (`category.filters`, `category.products`) pero los
nombres salen de `taxonomy_node.name` por la API. Hoy la app en inglés mostraría "Lácteos & Huevos".

## La solución: separar concepto, etiqueta y reconocimiento

### Capa 1 — el CONCEPTO es la identidad (neutral al idioma)

Cada nodo gana una `key`: una ruta slug en vocabulario neutro que **nunca se renderiza**.

```
pantry
pantry.rice-grains-legumes
frozen.ice-cream
dairy-eggs.milk
```

Y el id pasa a derivarse de la key, **sin el mercado**:

```python
node_id = uuid.uuid5(_NS, f"taxonomy:{key}")     # un concepto = un id, global
```

Las keys van en inglés por la misma razón que el código: son identificadores, no texto de producto.
Un concepto sin equivalente en inglés conserva su nombre local (`alcohol.mamajuana`) — la key no
traduce, sólo identifica.

**Esto solo ya paga la Fase 1:** renombrar una etiqueta deja de tocar la identidad. Se acabaron los
huérfanos.

### Capa 2 — la ETIQUETA es presentación, no identidad

Las etiquetas por idioma salen del bundle i18n que la app **ya tiene** en es/en/pt:

```ts
"save.category.pantry.rice-grains-legumes": "Arroz, Granos & Legumbres"  // es
                                            "Rice, Grains & Legumes"    // en
                                            "Arroz, Grãos & Legumes"    // pt
```

`taxonomy_node.name` sobrevive como etiqueta por defecto (el admin necesita algo legible cuando el
bundle no tenga la key todavía).

**Alternativa considerada:** una tabla `taxonomy_node_label(node_id, locale, label)`.

| | Bundle i18n | Tabla en DB |
|---|---|---|
| Costo | cero, ya existe | migración + CRUD + pantalla admin |
| Tipado | sí (union de keys) | no |
| Cambiar una etiqueta | requiere deploy | en caliente, sin deploy |

**Recomendación: el bundle.** Los nombres de categoría cambian rarísimo y la maquinaria ya está
construida y tipada. Se escala a tabla el día que operaciones pida renombrar sin deploy — no antes.

### Capa 3 — el RECONOCIMIENTO es por mercado, y NO se comparte

Ésta es la parte que la gente intenta compartir y no debe.

- Un producto brasileño dice `Arroz Branco Tipo 1`; los términos en español no lo pegan.
- **`víveres` en RD son las raíces** (yuca, plátano, batata). En otros países hispanohablantes
  significa "abarrotes" en general. Mismo idioma, distinto significado: no basta con separar por
  idioma, hay que separar por MERCADO.
- BGE-M3 es multilingüe, pero el TEXTO que embebés define dónde cae el vector. Embeber la etiqueta
  española y consultar con nombres en portugués degrada el top-1 en silencio.

Por eso `classification_terms` y `embedding` se mudan a una tabla por mercado:

```
taxonomy_node         (id, parent_id, key, level, default_label)
taxonomy_node_market  (node_id, market_id, classification_terms, embedding, active)
```

`active` es esencial: **no todo mercado lleva todas las categorías.** `alcohol.mamajuana` es DO;
un súper en Texas tiene pasillos que RD no tiene. El árbol de conceptos es la UNIÓN de todos los
mercados, y `active` dice cuáles usa cada uno. El clasificador de un mercado sólo considera sus
nodos activos.

> Esto además arregla algo que hoy está mal aunque no se note: `taxonomy_node.embedding` es un
> vector calculado con texto español, en una tabla cuya PK no incluye el mercado. Un segundo
> mercado no tendría dónde poner el suyo.

### Fuentes de verdad resultantes

```
docs/research/save-fable/taxonomy/
  concepts.md      ← keys + jerarquía   (neutral: LA ESTRUCTURA)
  labels.es-DO.md  ← etiquetas          (es-DO)
  labels.en-US.md  ← etiquetas          (en-US)
  labels.pt-BR.md  ← etiquetas          (pt-BR)
```

La estructura se decide UNA vez; cada mercado aporta etiquetas y términos.

## Plan por fases

### Fase 1 — desacoplar la identidad ✅ HECHA (2026-08-01)

1. ✅ Migración `a3f8d1c05e72`: `taxonomy_node.key` + `UNIQUE(market_id, key)`.
2. ✅ Backfill en SQL de las 150 keys (slug del padre + slug propio), idénticas a las del markdown.
3. ✅ El seed busca por `(market_id, key)` y **actualiza** el `name`; el id sólo se calcula al nacer.
4. ✅ El markdown lleva la key inline: `` -   Helados `congelados.helados` ``. Una línea sin key es
   un `ValueError` — derivarla del nombre reintroduciría el bug que la key elimina.

**Verificado**: segunda corrida idempotente; y un rename con la misma key **actualiza la etiqueta
conservando el id**, sin crear huérfanos. Los `classification_terms` y `embedding` de las 133 hojas
sobrevivieron (no se re-pagó el LLM).

Los nodos de nivel ≥2 (hijos de la demo) quedan con `key` NULL: no vienen del markdown.

### Fase 2 — separar el reconocimiento (cuando llegue el 2º mercado)

5. Migración: `taxonomy_node_market`; mover `classification_terms` + `embedding`.
6. `build_lexicon_index` y el clasificador filtran por `market_id` y `active`.
7. `generate_category_terms` recibe `--market` y genera en el idioma de ese mercado.
8. Las etiquetas se mudan al bundle i18n; `name` queda como fallback.

**No construir esto todavía.** ADR 33 ya dice "un país nuevo = un nuevo valor, sin tocar código", y
el diseño de arriba lo respeta. Hacerlo hoy sería construir para un cliente que no existe: no hay
con qué validar que el corte por mercado es el correcto hasta ver el catálogo real de US o BR.

## Lo que NO cambia

- `market_id` sigue siendo la llave de país en todo lo demás (ADR 33) — precios, canónicos, canasta.
- El category gate del matching sigue comparando PADRES: con ids globales, un canónico de DO y uno
  de US en el mismo concepto comparten padre, que es justo lo que hace posible comparar entre países.
- El clasificador conserva su cascada (léxico → embedding → juez); sólo cambia de dónde salen los
  términos.

## Regla de nombres (vigente ya, ver el header del markdown de categorías)

`build_lexicon_index` **descarta todo token que aparezca en más de una hoja**. Una hoja cuyos tokens
sean todos ambiguos queda invisible para la etapa léxica. Cada nombre debe aportar al menos un token
propio de ≥3 caracteres. El tokenizador no lematiza: `leche` ≠ `leches`, `frescas` ≠ `frescos`.

Cuando las etiquetas se muden al bundle i18n, **esta regla pasa a aplicarse por idioma**: el léxico
de en-US se deriva de las etiquetas en inglés y debe cumplirla por su cuenta.
