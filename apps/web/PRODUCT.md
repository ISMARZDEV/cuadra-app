# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos audiencias distintas conviven en `apps/web`, con necesidades opuestas:

1. **Consumidor dominicano que compra comida** (`/save/supermarkets/*`). Llega por búsqueda o por
   enlace compartido, casi siempre desde el móvil, muchas veces parado en un pasillo o antes de
   salir de casa. Su trabajo: saber si el producto que va a comprar está más barato en otra tienda,
   y cuánto. No tiene cuenta ni la necesita para consultar precios.

2. **Operador interno de Save** (`/admin/*`, la consola OFV). Cura el catálogo durante sesiones
   largas frente a un escritorio: resuelve la cola de matching, corrige productos canónicos mal
   armados, opera las corridas de ingesta y vigila la salud de las fuentes. Trabaja con volumen y
   con datos crudos de tres cadenas a la vez. Autenticado vía Clerk y limitado por capability.

Cuando este documento dice "el operador" sin más, se refiere al segundo.

## Product Purpose

Save es la vertical de comparación de precios de supermercados de Cuadra para República Dominicana.
Ingesta catálogos de las cadenas, resuelve qué producto de una tienda es el mismo producto de otra,
y publica una comparación por producto canónico con su histórico de precios.

Éxito para el consumidor: responde "¿dónde está más barato?" en un vistazo y con un precio en el que
puede confiar.

Éxito para el operador: el catálogo canónico se mantiene limpio sin que la curación se convierta en
un trabajo de tiempo completo — y, sobre todo, sin falsos enlaces.

## Positioning

El diferenciador no es tener precios: es **resolver la identidad de producto entre cadenas**. La
cascada determinista de matching (EAN → pg_trgm → pgvector/BGE-M3 → RRF → juez LLM → cola humana)
más la consola de curación que la corrige son lo que un competidor no puede copiar mirando la web.
Un catálogo comparable es el activo; la comparación es apenas su consecuencia visible.

De ahí se deriva la regla más dura del dominio: **un falso merge es el peor caso posible**. Es
preferible mandar un producto a la cola humana que enlazarlo mal. Toda la consola admin existe para
sostener esa postura.

## Operating Context

- **Mercado**: República Dominicana (`market_id = "DO"`), moneda DOP.
- **Cadenas ingestadas hoy**: Sirena, Nacional y Bravo, cada una con su plataforma y sus rarezas.
  Bravo no publica descripción de producto en su payload — un vacío real, no un bug.
- **Idiomas**: es / en / pt. El admin deriva su idioma del locale del usuario autenticado.
- **La ingesta es asíncrona y programada** (Dagster). El operador no ve el catálogo en vivo: ve el
  resultado de la última corrida, y necesita saber de cuándo es. La frescura del dato es parte de
  la información, no un detalle.
- **Rutas admin construidas**: cola de revisión, orquestación (lista y detalle por proveedor),
  proveedores, fuentes, consultas de canasta y productos canónicos (listado y detalle por id).
- **El operador cruza pantallas constantemente**: de una corrida a la cola que produjo, de la cola
  al canónico que creó, del canónico a la página pública. Los enlaces profundos entre consolas son
  parte del flujo de trabajo, no una comodidad.
- **Puertos de desarrollo**: web `:3006`, api `:8005`.

## Capabilities and Constraints

- **El dinero viaja en minor units enteras y se formatea solo en la UI.** Nunca floats. Ninguna
  cifra de precio se recalcula en el cliente.
- **Nada de precios ni históricos generados por IA.** Los KPIs salen del backend o de datos
  determinísticos.
- **El slug público es estable por defecto.** Regenerarlo es una mutación explícita, advertida y
  auditada, porque rompe URLs compartidas y SEO.
- **El EAN se almacena y se muestra en forma canónica GTIN-14** (zero-padded). Mostrar la forma
  cruda haría creer que dos tiendas no coinciden cuando sí lo hacen.
- **Toda mutación admin queda auditada** en el borde del controller, en la misma transacción del
  request (`AdminAuditRecorder`).
- **Lo que decide una persona nunca se registra como decidido por el sistema.** Una categoría
  asignada a mano se guarda con `method="human"`, igual que en el matching.
- **`match_method="llm"` significa exactamente una cosa**: el juez respondió y actuamos sobre su
  veredicto. Si la API no llegó a contestar, se registra `human`. La UI no debe difuminar esa
  distinción.
- SSR-first con Vike; la web consume únicamente el cliente generado `@cuadra/api-client`.
- **Invariantes SEO del Save público que no pueden regresar**: datos por SSR, URLs con slug,
  canonical, `og:image`, sitemap.
- **Sin acciones destructivas.** Archivar es soft-delete; no existe hard-delete. Merge y split de
  canónicos están fuera de alcance: la consola ALERTA sobre duplicados, no los resuelve.

### Decisiones de producto explícitamente ABIERTAS

No inventar una respuesta para estas — están esperando decisión del usuario:

- **Storage de imágenes** (US-CP-D4, subir imagen desde el ordenador). Sin definir entre S3/R2,
  volumen local, o diferirlo. Hoy el botón existe y explica honestamente por qué no hace nada.
  US-CP-D4b (restaurar una imagen previa) depende de la misma decisión.
- **Piso de auto-enlace del matching** (~0.85 hoy): si sube a 0.90 o si se enciende el juez LLM.

## Brand Commitments

**El sistema visual del admin es vinculante. Impeccable refina dentro de él; no lo reemplaza.**

- Fuente de verdad de diseño de la consola: Figma nodo `483:12411` (Cuadra App) y
  `docs/sdd/admin-workspace.md`.
- **Los 14 colores de categoría son exactos y están fijados** (nodo `502:6713`): cada categoría
  tiene su terna `bg` / `text` / `desc`. No se reinterpretan ni se re-derivan.
- **La tipografía del admin es Inter.** Es una decisión tomada y ya implementada en sidebar, top
  bar, tablas y badges de toda la OFV. El anti-patrón general de "no uses Inter" **queda anulado por
  este brief**: cambiarla tocaría todas las pantallas admin ya construidas.
- Verde Cuadra como color de marca.
- Stack de UI: Tailwind v4 + shadcn/ui, **migrando gradualmente de Radix a Base UI** (empezando por
  el sidebar del admin). Componentes nuevos deberían nacer en Base UI.
- Logos reales de las cadenas vía `ProviderLogo`; badges de categoría vía `CategoryBadge`.
- **Voz del admin: lenguaje de OPERADOR.** Capitalización tipo oración, no Title Case. Nada de
  jerga interna del código filtrada a la UI (`store_product`, `canonical_product_id`, nombres de
  tabla). Los estados vacíos y los bloqueos explican *por qué*, no solo *que no se puede*.
- El detalle admin **debe sentirse como una superficie operativa, no como una landing pública**.
  Puede inspirarse en la página pública de producto, pero no depender de sus componentes.

## Evidence on Hand

- Datos reales de dev sobre las tres cadenas: Sirena 48/48, Nacional 97/97, Bravo 81/81 productos
  cubiertos; 354 imágenes y 145 descripciones capturadas.
- Taxonomía real de categorías en `save.taxonomy_node` (padres nivel 0, hojas nivel 1).
- Histórico de precios real y append-only en la tabla `price`.
- Embeddings BGE-M3 (dim 1024) ya poblados sobre `canonical_product`.
- SDD refinados en el vault de Obsidian para el listado y el detalle de productos canónicos.
- **Ausencias que no se deben fabricar**: no hay testimonios, ni métricas de uso, ni base de
  usuarios públicos, ni acuerdos comerciales con las cadenas. Los datos de dev son de dev: no son
  cobertura de producción.

## Product Principles

1. **Un falso enlace cuesta más que un hueco.** Ante la duda, la cola humana. Toda la UI de curación
   debe hacer fácil dudar y difícil equivocarse rápido.
2. **Mostrar de dónde salió el dato.** Método de match, confianza, tienda de origen, corrida que lo
   creó, procedencia de la imagen. El operador decide con evidencia a la vista, no con una caja
   negra que afirma.
3. **Distinguir siempre lo que decidió una persona de lo que decidió el sistema.** En los datos y
   en la pantalla.
4. **La frescura es parte del precio.** Un precio sin su fecha es información incompleta.
5. **Ninguna acción irreversible sin fricción.** Regenerar un slug, archivar un canónico o enlazar
   en lote advierten su impacto antes, y quedan auditados después.

## Accessibility & Inclusion

Meta: **WCAG 2.2 AA** en ambas superficies — contraste, foco visible, navegación completa por
teclado y targets táctiles adecuados. La consola se usa durante horas seguidas, y el Save público se
usa mayormente en el móvil.

Deuda conocida a auditar: **varios de los 14 colores de categoría fijados no alcanzan AA en texto
pequeño** (por ejemplo `#e18200` sobre `#ffedd4`). Los colores son vinculantes, así que la salida no
es cambiarlos: es resolver el contraste por tamaño, peso, borde o rol del badge. Registrado como
tensión real, no como algo ya resuelto.
