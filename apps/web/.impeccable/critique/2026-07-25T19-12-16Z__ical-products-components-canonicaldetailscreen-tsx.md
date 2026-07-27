---
target: detalle de producto canónico (CanonicalDetailScreen)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-07-25T19-12-16Z
slug: ical-products-components-canonicaldetailscreen-tsx
---
Method: dual-agent (A: critique-A-design · B: critique-B-detector)

## Design Health Score

| # | Heurística | Score | Issue clave |
|---|-----------|-------|-------------|
| 1 | Visibilidad del estado | 3 | loading/ready/error del histórico bien distinguidos; "Agregar" imagen solo tiene `busy` global que atenúa todo el panel, sin feedback por ítem |
| 2 | Match con el mundo real | 3 | lenguaje de operador correcto, sentence case, sin jerga de tabla filtrada. `Hybrid` sin explicar es la excepción |
| 3 | Control y libertad | 2 | mover/borrar la imagen en posición 1 (la pública) es instantáneo y sin vuelta atrás; dos paradigmas de edición conviven (modal vs in-line) |
| 4 | Consistencia y estándares | 2 | la pantalla es internamente coherente, pero bypasea el sistema de componentes: 19 `<button>` a mano, solo 2 usan el primitivo `Button` |
| 5 | Prevención de errores | 2 | cero confirmación en borrar/reordenar imagen pública vs preview+advertencia completos en Regenerar slug — fricción invertida respecto al riesgo |
| 6 | Reconocer vs recordar | 3 | evidencia, método y confianza visibles junto al dato; buen soporte |
| 7 | Flexibilidad y eficiencia | 2 | sin atajos de teclado, sin header sticky en una pantalla larguísima, todo a click |
| 8 | Estética minimalista | 2 | árbol de categoría siempre expandido aun con sugerencia aceptada; 9 paneles con idéntico peso visual |
| 9 | Diagnóstico de errores | 3 | error del histórico con mensaje explícito; empty states que explican |
| 10 | Ayuda y documentación | 2 | tooltips en EAN y calidad, pero nada para conceptos propios como el método `Hybrid` |
| **Total** | | **24/40** | **Aceptable** |

## Design Specificity Verdict

**Veredicto partido, y la división ES el hallazgo.**

**El contenido es genuinamente autorado para Save.** Nadie escribe por accidente el manejo de GTIN-14 zero-padded con el razonamiento de dominio llevado hasta la UI. Nadie muestra `—` en vez de `0%` para un match humano — una decisión sutil que evita que se lea como "el sistema dudó" cuando fue una persona quien decidió. Nadie separa "Descripción del canónico" de "Descripciones de las tiendas" con la regla de copiar sin modificar el dato de la tienda. Eso es dominio real.

**El chrome es intercambiable, y por una razón estructural concreta**: la pantalla no usa el sistema de componentes. De 19 `<button>` del directorio, solo **dos** —"Regenerar slug" y "Archivar"— usan el primitivo `Button`. Todo lo demás está hecho a mano, y de ahí bajan en cascada cuatro síntomas que parecían problemas independientes: forma de píldora en vez de 10px, verde equivocado, anillo de foco distinto y token de sombra distinto. **Es un solo problema con cuatro caras, no cuatro problemas.**

**Deterministic scan**: `detect.mjs` salió con exit 2 y **8 hallazgos**, todos de la misma regla (`design-system-font-size`): tamaños literales de 10px y 11px fuera de la rampa documentada. 4 son etiquetas de eje dentro del SVG del chart (terreno donde el sistema no legisla); los otros 4 son badges contador sin excusa. `CanonicalDetailScreen.tsx` por sí solo sale limpio (exit 0) — todos los hallazgos viven en los hermanos. **Cero falsos positivos**; ninguno toca la familia tipográfica, así que la decisión vinculante sobre Inter no está en juego.

**Gap del detector, importante**: solo caza tamaños literales `text-[Npx]`. NO detecta excepciones hechas con clases de step de Tailwind (`text-base/lg/xl/2xl`), que son más numerosas. Esas se cazaron a mano.

**Visual overlays**: no disponibles. No hay herramienta de automatización de browser expuesta en esta sesión. La evidencia visual vino de un screenshot del render real aportado por el usuario, no de inyección — no hay overlay en el navegador.

## Overall Impression

Esta pantalla piensa bien y se viste mal. La inteligencia de dominio está toda ahí y es difícil de replicar; la capa visual está hecha a mano por fuera del sistema que el proyecto ya tiene construido. La mayor oportunidad no es rediseñar nada: es **conectar la pantalla a sus propios primitivos**. Eso solo cierra la forma de botón, el color de acción, el anillo de foco y el token de sombra de una vez.

El segundo tema, independiente del primero, es que **la fricción está invertida respecto al riesgo real**: lo que toca al consumidor con un click no avisa, y lo que avisa mucho es menos peligroso.

## What's Working

1. **El par Evidencia.** Método, humano-vs-automático y confianza juntos, con el `—` deliberado para matches humanos. Es el patrón firma del sistema y está ejecutado con fidelidad. Es lo mejor de la pantalla.
2. **GTIN-14 zero-padded con el razonamiento en la UI**, no solo en el código. Mostrar el crudo mentiría sobre coincidencias reales, y la pantalla lo honra.
3. **La sugerencia de categoría informa, no decide.** Muestra la señal de origen ("por arroz (léxico)") y deja al operador elegir — exactamente el Principio #3 del producto.
4. **Ningún `<img>` sin `alt`, ningún botón solo-ícono sin `aria-label`, ningún target táctil bajo 24px.** Los 18 botones revisados uno por uno están limpios en esos tres frentes.

## Priority Issues

### [P1] Los formularios no asocian etiqueta con control
El componente `Field` de `CanonicalFormModal.tsx:314-333` renderiza el `<label>` como HERMANO del control, sin `htmlFor`/`id`. No hay asociación programática en los **9 campos** del formulario de edición. Los `<textarea>` de descripción (`DescriptionPanel.tsx:83`) y de nota interna (`CanonicalDetailScreen.tsx:859`) tampoco tienen label ni `aria-label`.

**Por qué importa:** un lector de pantalla anuncia "campo de texto, en blanco". El operador que depende de él no puede llenar el formulario principal de curación. Y la meta declarada es WCAG 2.2 AA.

**Fix:** el patrón correcto YA EXISTE en el codebase — `FilterField.tsx:23-24` hace `htmlFor`/`id` bien. No es una limitación técnica, es una inconsistencia evitable. Portar `Field` a ese patrón.

**Suggested command:** `/impeccable harden`

### [P1] Dos inputs de búsqueda quedan sin ningún indicador de foco
`CategoryPicker.tsx:118` y `CanonicalProductsScreen.tsx:204` aplican `focus-visible:ring-0` sobre un componente base que ya trae `outline-none`, y no reponen nada. No es "un anillo distinto": es ausencia total de foco visible.

**Por qué importa:** navegando por teclado, el foco desaparece al entrar al buscador de categorías — justo el control del flujo de clasificación.

**Nota de alcance:** este es el hallazgo REAL de foco. Los ~17 botones hechos a mano NO están rotos: no declaran `outline-none` y no hay reset global en `globals.css`, así que conservan el anillo por defecto del browser. Es inconsistente con el sistema, no inaccesible.

**Suggested command:** `/impeccable audit`

### [P1] La fricción está invertida respecto al riesgo real
Borrar o reordenar la imagen en posición 1 —la que la propia UI llama *"Principal · la que ve el público"*— ejecuta al instante, sin confirmación. Regenerar el slug, de impacto comparable o menor, tiene preview y advertencia completas.

**Por qué importa:** el Principio #1 del producto dice que la UI debe hacer *fácil dudar y difícil equivocarse rápido*. Acá pasa lo contrario en el punto que toca a un consumidor real en producción. Y transmite calma justo donde debería haber una pausa.

**Fix:** exigir confirmación cuando la acción toca la posición 1, con el mismo patrón que ya usa Regenerar slug.

**Suggested command:** `/impeccable harden`

### [P2] La pantalla bypasea su propio sistema de componentes
19 `<button>` a mano; solo 2 usan el primitivo `Button`. Consecuencias medidas:
- **Forma:** todos los botones son `rounded-full`, contra la regla de que la píldora clasifica y el botón no.
- **Color:** `bg-brand`/`text-brand` (#16a34a) aparecen **0 veces en TODO el admin**; los botones corren sobre `bg-brand-lime` (83 usos) + `text-brand-forest` (24).
- **Foco:** `ring-brand-lime` (6 usos) en vez del `ring-ring` del sistema (1 uso en todo el admin).
- **Sombra:** los botones "primary" llevan `shadow-sm`, token que el sistema reserva al botón `outline`.

**Por qué importa:** cada pantalla nueva reinventa el botón, y el costo se paga en cada una. Además hace que la consola no se distinga de un admin genérico con paleta verde.

**Advertencia antes de tocar nada:** este hallazgo puso en evidencia un error del propio `DESIGN.md` (ver más abajo). Resolver la pregunta de color ANTES de migrar, o la migración propagará el error.

**Suggested command:** `/impeccable polish`

### [P2] Jerarquía plana: los 9 paneles pesan lo mismo
El componente `Panel` (`CanonicalDetailScreen.tsx:772`) aplica `border ... shadow-sm` uniformemente. Apila borde + sombra sobre el mismo límite —prohibido por "La Regla del Borde Único"— y aplana la jerarquía: **Evidencia** (el panel donde se decide si el match es correcto) pesa visualmente igual que **Duplicados posibles**, que en el screenshot dice "(0)" y ocupa media pantalla vacía.

**Fix:** sacar `shadow-sm` de `Panel`; diferenciar prioridad por peso, tono y orden — no por sombra. Y colapsar o encoger los paneles vacíos.

**Suggested command:** `/impeccable layout`

## Persona Red Flags

**Alex (power user, sesiones largas):**
- Ningún panel es sticky. El header con Editar/Archivar desaparece al scrollear una pantalla larga; hay que volver arriba para cualquier acción.
- Dos paradigmas de edición sin anunciarlo: "Editar" abre modal, pero Categoría, Descripción e Imagen editan in-line con sus propios botones "Guardar". Dos flujos para la misma tarea.
- El árbol completo de categoría queda expandido aunque ya haya sugerencia aceptada. En el screenshot, un producto de arroz muestra siete entradas de `Alcohol >` (Brandy, Cerveza, Cigarrillos, Espumantes, Ginebra, Hard Seltzer, Licor) antes que cualquier cosa relevante.
- Sin atajos de teclado en una herramienta de uso diario.

**Sam (accesibilidad):**
- Los 9 campos del formulario de edición sin label asociado (P1 arriba).
- Foco totalmente ausente en 2 inputs de búsqueda (P1 arriba).
- **Ningún `aria-live` en todo el archivo.** "Guardado" y los cambios de posición de imagen son puramente visuales: no hay confirmación audible de que la acción tuvo efecto.
- Salto de jerarquía h2 → h4: `Panel` renderiza `<h2>`, `CategoryPicker` (líneas 53 y 109) renderiza `<h4>`. El resto de sub-paneles respeta h2→h3 bien; `CategoryPicker` es la excepción.
- **10 de 14 pares de color de categoría fallan AA** en texto pequeño. El peor: `panaderia-tortilleria` a **2.48:1** (#e18200 sobre #ffedd4), contra el mínimo de 4.5:1. El fallback neutro también falla, a 4.33:1. Deuda ya documentada y aceptada, pero se manifiesta en vivo en esta pantalla.

**Operador de curación de Save (derivada del PRODUCT.md):**
- El Principio #4 —*"la frescura es parte del precio"*— **no tiene ninguna representación visual**. "Actualizado 25 jul" se ve idéntico para un dato de ayer y para uno de 60 días. Es exactamente el dato que esta pantalla existe para vigilar.
- `origin_run_id` es texto inerte en un `<code>`, cuando el PRODUCT.md dice que los enlaces profundos entre consolas *"son parte del flujo de trabajo, no una comodidad"*. Debería llevar a la corrida en Orquestación.
- El método `Hybrid` se muestra sin explicación. Es vocabulario interno de la cascada; el operador nuevo no tiene de dónde deducirlo.

## Minor Observations

- El chart amplifica ruido a señal: el eje Y va de RD$474.00 a RD$475.00, así que un peso de diferencia ocupa todo el alto y parece un desplome. Al lado, el KPI dice "Variación del rango RD$0.00". El gráfico y el número se contradicen a la vista.
- Las cifras de KPI usan `text-lg`, cuando el sistema asigna Display (1.5rem/700) justamente a "cifras de KPI". Están un escalón por debajo de lo que el propio sistema pide.
- Los títulos de los 5 modales usan `text-lg` donde el sistema pide `text-base` para "título de card y de modal". Consistente en los 5 — no es un typo.
- Cifras sin `tabular-nums`: `completeness_score`% del header (`:243`), los contadores `(N)` de cada `Panel` (`:779`), el `(total)` del listado y el badge de filtros activos.
- El aviso de "Subir imagen" está bien resuelto: un solo botón "Entendido" en vez de un diálogo con dos botones falsos. Explica honestamente por qué no hace nada.
- El botón "Guardar descripción" se ve deshabilitado en verde pálido; su estado es ambiguo a simple vista.
- Bravo tiene el mejor precio pero su columna "Tienda online" muestra "—": la fila más útil es la única que no se puede abrir.

## Questions to Consider

1. Si Categoría, Descripción e Imagen ya editan in-line en esta misma pantalla, ¿qué le queda al modal "Editar" que no debería vivir también in-line?
2. ¿Por qué ninguno de los 9 paneles es colapsable en una pantalla que un operador mira durante horas por producto?
3. Si la frescura es un principio de producto explícito, ¿por qué no hay ninguna señal que distinga un precio de hoy de uno de hace 60 días?
4. ¿Por qué mover la imagen que ve el consumidor real pesa menos fricción que regenerar un slug?
5. El árbol de categoría muestra alcohol y cigarrillos primero para una bolsa de arroz. ¿Debería el árbol completo aparecer solo cuando el operador rechaza las sugerencias?
