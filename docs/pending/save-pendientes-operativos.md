# Save · Pendientes operativos

> **Contexto.** Tres pendientes que sobrevivieron al PR #45 (mergeado con squash a `developer` →
> `8f92f08`). Ninguno es deuda de código: son una corrida que falta, un dato que falta en la base
> local, y un interruptor que nunca se encendió.
>
> Están ordenados por VALOR, no por esfuerzo. El §3 es el de mayor impacto del backlog.
>
> Para el diagnóstico de fondo —por qué el §3 encabeza la lista y qué falta para que Save esté
> completo— ver [`save-huecos-para-estar-completo.md`](./save-huecos-para-estar-completo.md).
>
> Anotado: 2026-08-02.

---

## 0. Antes que nada — re-correr la ingesta

No es uno de los tres, pero los precede: **el arreglo del parser de tamaños que acaba de entrar
actúa en INGESTA**. Las 5 filas que hoy tienen `size_text` vacío y sí traen el tamaño en el nombre
(`FRESAS SELECTAS UN`, `Plátano Maduro Und`, `Plátano Verde, Und`, `AVIVA GALLETAS INTEGRAL 9 PQ`,
`Arroz Jasmine 5 Goya Lbs`) **no se corrigen solas**: el código está en `developer`, los datos no.

Se rellenan al re-correr el flujo — el upsert de `store_product` actualiza `size_text`
(`repositories.py:864`). **No hace falta script de mutación.**

---

## 1. Flujo «Browse por sección» de Bravo — deben verse 41 corridas, no una

**Síntoma.** Al lanzar el flujo desde la consola de Orquestación aparece **una sola corrida** cuando
Bravo tiene **41 secciones** que recorrer. La cobertura queda cortada al primer tramo.

**Dónde mirar primero.** Es un job PARTICIONADO, y ahí está el gotcha ya pagado en F4:

> Un job particionado **debe lanzarse CON su partición** (`partition_key_for` + el tag
> `dagster/partition`). Sin eso la corrida **muere a los 3 segundos** sin explicación útil.

Así que la pregunta a responder es si el lanzamiento desde la consola está resolviendo **una**
partición en vez de expandir las 41 — no si el adapter recorre bien las secciones, que eso ya está
medido y funciona (el mapa `subfamiliaArticulo → sección` resolvió la categoría de origen de Bravo
del 0% al 39%).

**Verificar contra Dagster, no contra la consola:** Dagster es dueño del ESTADO de las corridas;
nosotros sólo somos dueños de lo que una corrida PRODUJO.

---

## 2. Reponer las 213 filas de `basket_query` en la base local

**Síntoma.** `test_backfill_populated_do_basket_queries` **falla en local y pasa en CI**.

**El test tiene razón — no se toca.** El reset de la base local borró las 213 filas que siembra el
backfill; CI arranca de cero y las migraciones se las siembran. El test es un canario correcto: está
avisando que a la base local le falta un dato real, no que el test esté mal escrito.

> ⚠️ **CI y local fallan en direcciones OPUESTAS por la misma causa** (tests acoplados al estado de
> la base). El caso espejo ya ocurrió: `test_category_decision_recorder` pasaba en local y fallaba en
> CI porque tomaba proveedor y hojas prestados con `SELECT … LIMIT`, y CI arranca limpio.
> **Nunca diagnosticar uno de estos sin leer el log real de CI.**

**Regla que se desprende, para tests de integración:** corren contra la base de DESARROLLO dentro de
una transacción revertida. Aíslan lo que ESCRIBEN, no lo que ya había. Nunca usar `SELECT … LIMIT`
sobre datos que el test no sembró, ni EANs reales en fixtures.

---

## 3. Encender el juez LLM — el de mayor impacto del backlog

**Por qué es el primero en valor.** El **47% de la cola de revisión cae en banda gris**: ni la señal
determinista alcanza para auto-enlazar, ni es tan floja como para descartar. Es exactamente la
población que el juez existe para resolver, y hoy la está resolviendo un humano a mano.

**Y el PR #45 aumentó esa población A PROPÓSITO.** El arreglo del complemento de «de» convirtió 12
falsos positivos que se auto-enlazaban a 0.95 en **abstenciones**. Es la decisión correcta —mejor
abstenerse que enlazar mal— pero el destino de esas abstenciones es la banda gris. Encender el juez
es lo que cierra ese circuito.

**Dónde está el interruptor.** `settings.save_llm_judge_enabled` en el composition root; con el flag
apagado se pasa `None` en vez de `CategoryJudge()` y la cascada retorna antes de llegar al juez.

> ⚠️ **En DEV el juez NO corre Claude.** `LLM_PROVIDER=openai`, así que el `ClaudeJudge` ejecuta
> **gpt-4o** (smart) / **gpt-4o-mini** (fast) — el nombre de la clase es engañoso. Producción sí
> cambiará a `anthropic`. Para inspeccionar configuración usar **`scripts/env-doctor.sh`**, nunca
> leer `.env` directo.

**Precedente a respetar al medirlo.** Las dos capacidades anteriores que se evaluaron con el juez
encendido dieron **resultado NEGATIVO y se decidió no cablearlas** (el gate de departamento subía el
conteo del 25% al 92% pero BAJABA la calidad; la degradación de tokens por etiqueta débil quedó
frenada por el gate de simulación en 2 de 3 criterios). Encender el juez es una hipótesis a medir,
no una mejora asumida.
