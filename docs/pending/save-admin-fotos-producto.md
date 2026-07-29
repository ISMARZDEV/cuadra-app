# Fotos de producto en el OFV — unificación y visor

**Estado**: **COMPLETO** en las seis superficies. **Nada commiteado** sobre `db8bf3f`.
**Rama**: `feat/save-canonical-products-followups`.

---

## 1. El problema

Una foto de producto aparece hoy en **seis superficies** del admin, y cada una la trataba distinto.
Las tiendas publican relaciones de aspecto muy diferentes —Bravo manda lienzos grandes con el
producto chico adentro, otras mandan verticales— así que `object-cover` recortaba justo los
extremos: **el saco de arroz salía sin la marca arriba ni el gramaje abajo**, que es exactamente lo
único que el operador mira para decidir si dos productos son el mismo.

A eso se sumaba que las fotos ya vienen recortadas **sobre fondo blanco**: sin una tarjeta con
contorno propio no se sabe dónde empieza y dónde termina cada imagen.

---

## 2. Las dos reglas que rigen todo

1. **`object-contain`, nunca `object-cover`.** Recortar puede esconder el dato que se vino a mirar.
   El tamaño del cuadrado lo decide la superficie; la foto se acomoda adentro.
2. **Toda foto va sobre una tarjeta.** El par de superficies vive en
   `apps/web/src/features/admin/lib/product-surfaces.ts`:

   | Constante | Valor | Rol |
   |---|---|---|
   | `PRODUCT_CANVAS_BG` | `#F4F6F7` | lienzo (fondo del visor) |
   | `PRODUCT_CARD_BG` | `#FDFFFF` | tarjeta (detrás de cada foto) |

   No son tokens del tema y **no cambian en oscuro**: una foto recortada sobre blanco necesita
   respaldo claro o se vuelve un bloque.

---

## 3. Lo que YA está hecho

| Pieza | Archivo | Estado |
|---|---|---|
| Par de superficies | `features/admin/lib/product-surfaces.ts` | ✅ |
| Visor de galería | `features/admin/components/ImageLightbox.tsx` (+12 tests) | ✅ |
| Thumbnail clickeable | `features/admin/components/ThumbnailLightbox.tsx` (+7 tests) | ✅ |
| Thumbnail + contador | `features/admin/components/ThumbnailWithCount.tsx` | ✅ tarjeta + contain |
| Columna Imagen · tabla canónicos | `CanonicalProductRow.tsx` | ✅ |
| Columna Imagen · tabla cola | `ReviewRow.tsx` | ✅ |
| Endpoint galería de tienda | `GET /v1/admin/save/store-products/{id}/images` | ✅ (+4 tests) |
| Galería del detalle canónico | `ImageGalleryPanel.tsx` | ✅ ya usaba `object-contain` |

| Primitivo de tarjeta | `features/admin/components/ProductPhoto.tsx` (+5 tests) | ✅ |
| Detalle canónico · encabezado | `CanonicalDetailScreen.tsx` | ✅ tarjeta + visor |
| Detalle cola · panel de tienda | `detail/StoreProductPanel.tsx` | ✅ tarjeta + visor |
| Detalle cola · candidatos | `detail/CandidateCard.tsx` | ✅ tarjeta + visor |

`ProductPhoto` es el primitivo ÚNICO: `ThumbnailWithCount` lo usa por dentro (tablas) y los tres
detalles lo consumen vía `ThumbnailLightbox` con su propio `className` de tamaño.

---

## 4. Cómo quedó cada superficie

| Superficie | Tamaño | Visor | Fuente de la galería |
|---|---|---|---|
| Tabla canónicos · Imagen | 48px | ✅ | `listCanonicalImages(id)` |
| Tabla cola · Imagen | 48px | ✅ | `listStoreProductImages(id)` |
| Detalle canónico · encabezado | 112px | ✅ | `images` del SSR — **sin fetch** |
| Detalle cola · panel de tienda | 72px | ✅ | `listStoreProductImages(storeProductId)` |
| Detalle cola · candidato | 80px | ✅ | `listCanonicalImages(candidate.canonical_product_id)` |
| Detalle canónico · galería | — | — | ya usaba `object-contain` |

**Cambio de contrato**: `StoreProductPanelProps` ganó `storeProductId?: string`
(`detail/interfaces.ts`), que pasa `ReviewDetailScreen` desde `detail.store_product_id`.

**Efecto lateral aceptado**: el hueco "sin imagen" de la cola pasó del ícono `ImageOff` al `Boxes`
del catálogo. Ahora las seis superficies muestran el mismo vacío — antes el detalle de la cola
mostraba un ícono de "imagen rota" que se leía como error, no como dato faltante.

### Medición (6 superficies, ninguna desborda)

| Marco | Imagen | `objectFit` |
|---|---|---|
| 112×112 | 102×44 (apaisada) | contain |
| 112×112 | 56×102 (vertical) | contain |
| 72×72 | 62×27 | contain |
| 80×80 | 38×70 | contain |

**1600 backend · 640 web · typecheck limpio.** Cero errores de JS en el render.

## 6. Decisiones que necesitan al usuario

1. ~~¿Visor en las tarjetas de candidato?~~ **RESUELTO**: sí lo lleva. Un candidato ES un canónico,
   así que su galería curada es justo contra lo que se compara la foto de la tienda. Sin foto no
   es clickeable, que es la mayoría de los casos observados.
2. **`text-[10px]` del contador** (`ThumbnailWithCount`): sigue marcado por impeccable, sin waiver.
   Opciones: formalizarlo en `DESIGN.md` (recomendado — uso real y acotado: dos dígitos en un
   círculo de 20px), waiver, o subirlo a `text-xs` verificando que entren dos dígitos.
3. **Fotos con relación extrema** (1:4). Contenidas quedan muy chicas (≈10×38 en un marco de 48).
   Es honesto, pero si molesta la salida es **normalizar en la ingesta**, no en la UI.

---

## 7. Verificación exigida (no negociable)

- Medir `img.getBoundingClientRect()` contra el marco en **4 relaciones de aspecto** (2:3, 7:3, 1:1,
  1:4) y comprobar `desborda: false`. Un screenshot chico no alcanza para juzgarlo.
- Claro **y** oscuro.
- Suites completas: backend (`make test`) y web.

### Gotchas medidos esta sesión

- **`pnpm vitest run` desde la RAÍZ** corre los 129 archivos de todos los workspaces y reporta ~104
  fallos ajenos. Siempre `cd apps/web` explícito — el shell vuelve solo a la raíz.
- **`ring` se dibuja FUERA de la caja**: un contenedor con `overflow-x-auto` lo recorta en las
  esquinas. Usar `border` (siempre 2px, transparente cuando no aplica, para no desplazar el layout).
- Una miniatura vacía en un screenshot **no es un bug**: puede ser una imagen externa sin cargar.
  Confirmar con `waitForFunction(() => img.complete && img.naturalWidth > 0)`, nunca con un timeout.
- Para verificar `/admin` sin sesión Clerk (SSR devuelve 403): crear una página de preview **nueva y
  desechable** en `pages/`, capturar, borrar. Archivo untracked = cero riesgo sobre lo trackeado.
- Tras tocar cualquier DTO: `make openapi`. `apps/api/openapi.json` y
  `packages/api-client/src/generated/` están **gitignoreados** — el contrato no viaja en el commit.
