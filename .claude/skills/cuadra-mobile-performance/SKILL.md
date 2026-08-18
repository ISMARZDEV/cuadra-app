---
name: cuadra-mobile-performance
description: >
  Rendimiento de la app Expo de Cuadra: DÓNDE se mide (nunca en modo desarrollo), qué costaba de
  verdad en las pantallas pesadas de Save, y los ajustes que sí movieron la aguja — ventaneo de
  listas, congelado de pestañas ocultas, y el peso real de las fotos de producto. Cada número está
  MEDIDO en dispositivo, no estimado.
  Trigger: cuando algo «va lento», «se siente pesado», «da tirones» o «se traba»; ante fps bajos,
  RAM que sube, listas que cuestan al desplazarse o imágenes que tardan; y ANTES de optimizar nada,
  para no perder una sesión persiguiendo un fantasma del modo desarrollo.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> Compone con `cuadra-motion` (si lo que va mal es una animación, empieza ahí), `cuadra-mobile`
> (estructura) y `expo-ios-free-device` (cómo compilar el release donde se mide).

## ⭐ Antes de tocar NADA: el modo desarrollo ES el problema

**Un «problema de rendimiento» medido en dev puede no existir.** Confirmado en este repo: la app iba
a tirones en dev y FLUIDA en release, con el mismo código.

Por qué dev miente, y no es un detalle:

- **Hermes compila en caliente** y `__DEV__` valida en cada paso.
- ⭐ **El inspector de red RETIENE cada respuesta.** Medido en una sesión: **594 → 901 → 1214 MB** sólo
  navegando.
- **Fast Refresh conserva módulos viejos** en memoria.
- Y la consecuencia que lo explica todo: **con la RAM subiendo, el recolector de basura se come los
  fotogramas** → **JS a 21 fps con la UI a 60**. Ese perfil —UI bien, JS hundido— es la FIRMA de este
  problema, no de tu código.

**Regla: ningún juicio de fluidez vale si no se hizo con bundle de producción.**

```bash
./dev-fast.command      # dev-up --no-dev --minify: mismo entorno, bundle de producción
./ios-release.command   # el juicio definitivo: binario Release, autónomo
```

⚠️ `dev-up` y `dev-fast` NO pueden correr a la vez (hay un guardián; `dev-down` entre medias).

## Lo que sí costaba

| Hallazgo | Medida | Arreglo |
|---|---|---|
| **`windowSize` vale 21 por defecto** en FlatList | La rejilla no tenía NINGUNA prop de ventana: montaba ~20 pantallas para enseñar una | `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`, `removeClippedSubviews` |
| **Pestañas ocultas siguen renderizando** | — | `freezeOnBlur` en el layout de tabs |
| **Fotos a 1000×1000** | **~4 MB por foto** descomprimida en iOS, aunque se pinte a 90pt | Pedirlas ya dimensionadas |
| **Doce `RiseIn` por fila** | La lentitud real de la entrada | Un reloj compartido con una ventana por elemento (ver `cuadra-motion` §7) |

### El tamaño de una imagen se decide donde se CONSTRUYE la URL

VTEX redimensiona por parámetro de URL, así que el ancho es parte del enlace, no del pintado. **Va en
el backend** (`contexts/save/domain/image_variant.py`), no en el cliente: es una regla del proveedor,
y en el móvil sería un parche que hay que repetir en cada pantalla que enseñe un producto.

## Reglas al optimizar

- ⭐ **Si afinar un parámetro no mejora nada tras DOS intentos, ese parámetro NO es la causa.** Costó
  varias rondas creer que la lentitud era la curva del muelle cuando eran doce animaciones por fila.
- **React Compiler YA ESTÁ ACTIVADO** (`app.json` → `reactCompiler: true`). No añadas `useMemo` /
  `useCallback` a ciegas: `react-doctor` los marca como *manual memoization in compiler-managed code*.
  Memoiza sólo con una razón medida (p. ej. un callback que invalida la memo de una fila).
- ⚠️ **Animar la opacidad de un contenedor con muchos hijos = compositing alfa FUERA DE PANTALLA**:
  iOS dibuja todo el subárbol en un búfer aparte en CADA fotograma. Usa `translateY`, que la GPU
  aplica sobre la capa ya dibujada. (Detalle en `cuadra-motion`.)
- **Mide en el dispositivo, no en el simulador**: el simulador no tiene ni la GPU ni la presión de
  memoria del teléfono.

## Commands

```bash
./dev-fast.command                                   # bundle de producción sobre el entorno de dev
./ios-release.command                                # binario Release en el iPhone (autónomo)
npx react-doctor@latest --verbose --scope changed    # compara la rama contra main; filtra por TUS archivos
```

⚠️ **Medir memoria en dispositivo exige Instruments.app (GUI)**: `xctrace record --attach` NO funciona
desde la CLI con iOS 26.

⚠️ El escaneo de `react-doctor` es de RAMA COMPLETA (cientos de avisos preexistentes de admin/web).
No es una puerta: filtra por los archivos que tocaste antes de sacar conclusiones.

## Resources

- `scripts/dev-fast.sh` — el bundle de producción sobre el entorno de dev
- `scripts/ios-device-release.sh` — el binario Release
- `apps/api/src/contexts/save/domain/image_variant.py` — el dimensionado de fotos, en el backend
- `apps/mobile/app/(tabs)/_layout.tsx` — `freezeOnBlur`
- `apps/mobile/src/features/save/supermarket/browse-screen.tsx` — la rejilla con su ventaneo
