# 03 · Teardown de SupermercadosRD (referencia/competidor) + taxonomía + diferenciación Cuadra

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** Transversal (producto/UX + taxonomía)
> **Fuente:** 3 capturas de `supermercadosrd.com` provistas por el usuario (home, detalle de
> producto, listado de categoría). Análisis directo. Append-only, sin resúmenes.
> **Scope aclarado por el usuario:** Save será una **sección en la web de Cuadra**, **simple al
> inicio**, enfocada en **supermercados primero**, y luego **productos financieros, seguros, etc.**

---

## 1. Qué hace SupermercadosRD, pantalla por pantalla (lo observado)

### Home (imagen 1)
- Hero: *"Busca, compara y ahorra — Encuentra el supermercado más barato hoy"* + buscador
  *"¿Qué quieres comprar hoy?"*.
- **Fila de 15 categorías con ícono:** Alcohol · Bebés · Bebidas · Proteínas · Hogar · Cuidado ·
  Despensa · Embutidos · Escolares · Frutas · Lácteos · Mascotas · Panadería · Salud · Snacks.
- **Cards de producto** (patrón repetido en toda la app): badge de descuento (−28%, −32%…),
  **tag de tamaño** (200 ML / 10 LB / 30 UND), nombre, marca, **precio** (RD$240.5), **precio por
  unidad base** ($120.25 por 100 ML · $45.00 por LB · $6.96 por UND), y **contador "N tiendas"**.
- **"Ofertas por supermercados":** logos de **Bravo, Jumbo, Sirena, Nacional, Merca Jumbo, Plaza
  Lama, PriceSmart, Carrefour** (nota: cubren PriceSmart, y en el detalle aparecen **Ritmo** y
  **Líder** → más cadenas de las 8 del brief original).
- Carruseles temáticos curados ("Protector solar", "Limpieza") y **"Mejor valor por tu dinero"**
  (más cantidad por menos = ranking por precio/unidad).
- **"Inspiración":** blog/SEO programático con **análisis de precios** (*"Algunos cafés han subido
  hasta 29.42%"*) → contenido que rankea y usa el histórico.
- Footer/misión: *"plataforma independiente… información clara y comparable sobre precios,
  cantidades y valor real."*

### Detalle de producto (imagen 2 — "Arroz Enriquecido La Garza 10 LB")
- **Breadcrumb de 4 niveles:** Inicio › Despensa & Abarrotes › Arroz, Granos & Legumbres › Arroz ›
  Arroz Blanco.
- Encabezado: nombre + marca + tamaño + **"Compara precios desde RD$424 hasta RD$475"** +
  **"#2 más popular en Arroz Blanco"** (ranking de popularidad por categoría) + **"Agregar a lista"**.
- **Tabla de comparación por tienda**, ordenada ascendente por precio:
  Merca RD$424 (RD$454 tachado, $42.40/LB, **"Mejor precio"**) · Bravo RD$438 (**+RD$14 más caro**)
  · Jumbo RD$440 · Ritmo RD$448 · Nacional RD$454.95 · Jumbo RD$454.95 · Carrefour RD$459.95 ·
  Plaza Lama RD$474 · Sirena RD$475 (**+RD$51 más caro**). Cada fila con botón **"Buscar"** (link a
  la tienda).
- **Cartel de honestidad:** *"Actualizado hace 1 hora · **Estos precios están disponibles online y
  pueden variar en la tienda**."* ← confirma en vivo el Riesgo #1 (online ≠ góndola).
- **"Alternativas del supermercado"** (sustitutos): Arroz Premium de otras marcas/tiendas.
- **"Productos relacionados"** + **"Más de La Garza"** (mismas líneas en 5/3/2/12/20/30/50 LB →
  variantes de TAMAÑO del mismo producto).
- **"Historial de precios":** line-chart con toggles **1 Mes / 3 Meses / Todos** + dropdown
  "Supermercados". (El foso, hecho visible → ya NO es diferenciador, es table-stakes.)
- **"Propiedades":** Tipo (Arroz Blanco) · Marca (La Garza) · **Calidad (Premium)**.
- **"Feedback":** *"La información proviene de múltiples fuentes externas y debe usarse solo como
  guía. ¿Notaste algo incorrecto?"* → **Enviar comentario | Reportar problema | Sugerir categoría**
  = human-in-the-loop de corrección de matches/taxonomía, expuesto al usuario.

### Listado de categoría (imagen 3 — "Arroz Blanco", 104 productos)
- Orden por **Popularidad**. Filtros a la izquierda: **Precio** (histograma + rangos), **Supermercados**
  (Carrefour 47 · Sirena 41 · Jumbo 35 · Nacional 31 · Merca Jumbo 30 · Ver más), **Marcas** (Pimco
  14 · Bisono 12 · La Garza 9 · Campos 8 + buscador de marca).
- Cards con tamaño, marca, nombre, **Calidad (Premium/Selecto)**, precio y **precio/unidad**.
- **"Compra semanal básica":** *"Revisa en qué supermercado cuesta menos una compra semanal
  básica"* + **"Agregar 17 productos"** → **comparación de CANASTA** (arroz, leche, aceite, salami,
  plátano…). ← feature de alto valor: no comparás 1 producto, comparás tu compra entera.

## 2. Taxonomía observada (semilla del canonical de Cuadra)
Multi-nivel, 4 profundidades. Top-level (de los íconos) → ejemplo de rama profunda:
```
Despensa (& Abarrotes)
  └─ Arroz, Granos & Legumbres
       └─ Arroz
            └─ Arroz Blanco        → hoja donde vive la comparación
Atributos de producto en la hoja: Tipo · Marca · Calidad (Premium/Selecto) · Tamaño (valor+unidad)
```
15 categorías tope: Alcohol, Bebés, Bebidas, Proteínas, Hogar, Cuidado, Despensa, Embutidos,
Escolares, Frutas, Lácteos, Mascotas, Panadería, Salud, Snacks.
→ **Decisión de modelado:** taxonomía canónica **jerárquica (árbol)**, no plana; el `canonical_product`
cuelga de una hoja; atributos `brand`, `quality`, `size(quantity+unit)` para desambiguar variantes.

## 3. Insights validados en vivo (lo que las imágenes confirman de nuestro análisis)
1. **Online ≠ góndola CONFIRMADO por el propio competidor** ("precios online, pueden variar en
   tienda"). Refuerza `price_type` + nuestra oportunidad de diferenciar con **precio de góndola real**.
2. **Precio por unidad base es central** (aparece en TODA card) → la normalización es núcleo, no opcional.
3. **"N tiendas" y comparación ordenada** = la salida directa del matching. El matching ES el producto.
4. **Human-in-the-loop expuesto** ("Reportar problema / Sugerir categoría") → valida la cola de
   revisión (pilar 2) y que el matching nunca es perfecto.
5. **Variantes por tamaño y calidad** ("Más de La Garza" 5-50LB; Premium/Selecto) → el modelo canónico
   debe distinguir tamaño/calidad, no colapsarlos.
6. **Canasta ("Compra semanal básica")** = el gancho que conecta con la lista de compra y el triángulo.
7. **Histórico visible = table-stakes** (ya lo hacen). Nuestro foso NO puede ser "mostrar histórico".

## 4. 🏆 Diferenciación de Cuadra vs SupermercadosRD (dónde ganamos)
SupermercadosRD ya hace bien: buscar, comparar, unit-price, histórico, canasta, SEO. Es un competidor
serio. Copiarlo = océano rojo. Cuadra gana en lo que ELLOS NO PUEDEN:
- 🥇 **El triángulo Insights × Save:** ellos comparan precios genéricos; nosotros cruzamos contra
  **TU gasto real** ("compraste esto un 12% más caro que en Bravo"). Requiere tus transacciones → ellos no las tienen.
- 🥇 **Precio de GÓNDOLA real vía recibo/e-CF:** ellos admiten que solo tienen online. Nuestro OCR/e-CF
  da el precio que REALMENTE pagaste, con sucursal y fecha → dato más veraz + legal.
- 🥇 **El subagente conversacional (AISpace):** ellos tienen un buscador; nosotros un agente que
  responde *"armame la compra más barata del mes según lo que sueles comprar"* cruzando ambos mundos.
- 🥇 **Save como sección financiera ampliable:** supermercados es el pie; luego productos financieros,
  seguros → un marketplace de ahorro que un comparador de góndola no puede seguir.

## 5. Implicación de scope (aclaración del usuario)
Save = **sección en la web de Cuadra**, **simple al inicio**, **supermercados primero**, luego
**financieros/seguros**. → El MVP visible es acotado (buscar + comparar + canasta/lista para
supermercados), pero el **modelo de dominio** debe nacer genérico (`Provider.type` = super|bank|
insurer…) para no reescribir cuando entren los verticales financieros. Ya previsto en la arquitectura
(`Provider(type)`), acá se confirma.

---

**Decisiones que deberías tomar ahora:**
- ¿Adoptamos la **taxonomía jerárquica** observada (15 tope + ramas) como semilla del canonical, o
  querés una propia? (Recomiendo partir de la de ellos: ya está validada por el mercado RD.)
- ¿La **canasta ("compra semanal básica")** entra al MVP visible como gancho al triángulo? (Recomiendo sí.)

**Qué investigar después:** cómo se representa esta taxonomía + variantes (tamaño/calidad) en el
modelo canónico y en el retrieval del agente (pilar 4); y el pilar 3 (agregadores Hero/Uber + matching).

---

## Corrección de encuadre (2026-07-03) — decisión del usuario
El §4 hablaba de "no copiar / diferenciar". **Encuadre corregido:** el usuario quiere **paridad
total** con SupermercadosRD (tener TODO lo que tiene) **+** el foso Cuadra encima. No es copiar: ese
feature-set es **table-stakes** de cualquier comparador de precios. La diferenciación NO se logra
quitando features, sino **teniéndolas todas y agregando** lo que ellos no pueden (triángulo, góndola
real, agente, financiero). El catálogo completo de funcionalidades (paridad + foso) vive en
[`04-save-funcionalidades.md`](04-save-funcionalidades.md).
