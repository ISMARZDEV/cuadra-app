# Save · Qué falta para estar completos

> **Contexto.** Diagnóstico medido contra la base de desarrollo el **2026-08-02**, después de
> mergear el PR #45 (`8f92f08`).
>
> La conclusión en una línea: **Save está prácticamente construido y casi vacío.** Lo que falta no
> son features — es haber CORRIDO la máquina. Los cuatro huecos de abajo son de DATO y de
> OPERACIÓN, no de código.
>
> Los tres pendientes accionables que salen de acá viven en
> [`save-pendientes-operativos.md`](./save-pendientes-operativos.md).

---

## Estado medido

| | |
|---|---:|
| Proveedores activos | 8 |
| …con datos reales | **3** — Sirena 120 · Nacional 144 · Bravo 52 |
| …en cero | **5** — Jumbo, Merca Jumbo, Carrefour, Plaza Lama, Ritmo |
| `store_product` totales | **316** |
| …enlazados | 155 |
| …con EAN | 133 |
| `canonical_product` | 133 |
| **Canónicos comparables (>1 tienda)** | **20** = 15% |
| Snapshots de precio por producto | **1** (los 316) |
| Cola: `auto_linked` / `pending_review` | 155 / **161** |

---

## 1. Escala de catálogo

316 productos es un piloto, no un catálogo — un súper real tiene decenas de miles de SKUs. Y **5 de
los 8 proveedores nunca ingirieron nada**.

Sin esto, ninguno de los otros tres huecos se arregla: son todos consecuencia de éste.

---

## 2. Comparabilidad — LA métrica del producto

Sólo **20 de 133 canónicos (15%)** existen en más de una tienda. Los otros 113 tienen un precio
único: se pueden mostrar, pero **no comparar**.

Save existe para responder *«¿dónde está más barato?»*, y hoy responde eso para el 15% del catálogo.

**No se arregla con matching.** La comparabilidad **emerge** cuando dos tiendas ingieren el mismo
producto — es consecuencia directa del hueco 1. Ajustar la cascada no crea productos que no están.

---

## 3. Historial de precios: no existe

Cada producto tiene **exactamente un** snapshot en `save.price`. Sin corridas repetidas en el tiempo
no hay serie temporal, y sin serie no hay:

- gráfico de historial,
- alertas de baja de precio,
- la pregunta que de verdad importa: *«¿está caro AHORA, o siempre costó esto?»*.

Esa es la mitad del valor del producto, y la parte que un scraper casero no puede copiar: **el
historial no se scrapea, se acumula.**

**Es el más barato de los cuatro** — la orquestación ya está construida (F4), es dejarla corriendo.
Y es el único que se resuelve con TIEMPO en vez de con trabajo. Cuanto más tarde arranque el reloj,
más tarde existe la ventaja.

---

## 4. El embudo de revisión no escala

**161 pendientes contra 155 enlazados**: más de la mitad de lo ingerido espera a un humano. Con el
juez apagado, **cada producto nuevo agranda una cola que resuelve una persona a mano**.

Nacional lo muestra crudo: **144 productos, 15 enlazados (10%)**. Es Magento, no expone EAN
(ver [`save-ean-por-plataforma.md`](./save-ean-por-plataforma.md)), así que su catálogo entero cae en
la banda gris.

Éste es el hueco que hace que escalar el catálogo **duela** en vez de simplemente tardar.

---

## Cómo se encadenan

No son cuatro tareas paralelas. Es una secuencia con un cuello de botella:

```
Encender el juez (4)
    → destraba la cola
        → hace tolerable ingerir en volumen (1)
            → el volumen produce comparabilidad (2)
                → las corridas repetidas producen historial (3)
```

Por eso **el juez LLM es lo primero** aunque parezca lo más técnico de la lista: es lo que convierte
«ingerir más» de un problema en una ventaja. Detalle y precedentes en
[`save-pendientes-operativos.md §3`](./save-pendientes-operativos.md).

---

## Lo que este documento NO afirma

Honestidad sobre el alcance de la medición, para que nadie lo lea como más de lo que es:

- **No se verificó end-to-end** si alertas de precio, colecciones curadas y push están cableadas
  hasta la app. Las tablas existen (`price_alert`, `push_token`, `collection`, `basket_query`), pero
  **eso prueba esquema, no funcionamiento.** Pendiente de confirmar antes de contarlas como hechas.
- Los números salen de la base de **desarrollo**, que fue reseteada — no son producción.

## Aparte del dato: el despliegue

No es código, pero sin esto no hay usuarios reales: falta la **instancia de Clerk Production** y
**Apple Sign In**, que requieren cuenta de Apple paga.
