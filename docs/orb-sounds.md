# Sonidos del orbe / selector

Los sonidos son **assets** (los sirve Metro). `expo-audio` ya está en el build nativo, así que
**agregar/cambiar sonidos es solo JS** → recargás el dev client, sin recompilar.

## Dónde viven
```
apps/mobile/src/assets/sounds/
├── tick-a-current.wav     # tic del recorrido (actual)
├── tick-b-crisp.wav       # tic más agudo/seco
├── tick-c-tock.wav        # tic grave, "tock"
├── tick-d-soft.wav        # tic suave/redondo
└── external-sounds/
    ├── ai-intro-01.wav    # aparición del orbe (swipe up)
    └── close-01.wav       # cierre del orbe (swipe down / auto-hide)
```

## Cómo ESCUCHARLOS (en la Mac, sin abrir la app)
`afplay` reproduce cualquier archivo. El nombre del archivo = su "nombre". Subí el volumen 🔊:
```bash
cd apps/mobile/src/assets/sounds
! afplay tick-a-current.wav
! afplay tick-b-crisp.wav
! afplay tick-c-tock.wav
! afplay tick-d-soft.wav
! afplay external-sounds/ai-intro-01.wav
! afplay external-sounds/close-01.wav

# sonidos del sistema de macOS (referencia tipo "tic"):
! afplay /System/Library/Sounds/Tink.aiff
! afplay /System/Library/Sounds/Pop.aiff
! afplay /System/Library/Sounds/Morse.aiff
```

## Cómo CAMBIARLOS en la app
Un único lugar, arriba de `src/components/navigation/cuadra-tab-bar.tsx`:
```ts
const TICK_SOUND   = require("../../assets/sounds/tick-a-current.wav");          // recorrido
const REVEAL_SOUND = require("../../assets/sounds/external-sounds/ai-intro-01.wav"); // aparece
const CLOSE_SOUND  = require("../../assets/sounds/external-sounds/close-01.wav");    // cierra
```
Cambiás el archivo en el `require`, guardás, recargás la app. (Para sumar un sonido nuevo, dejalo en
`src/assets/sounds/` y apuntá el `require` ahí.)

## Mapeo gesto → sonido + háptico
| Gesto | Sonido | Háptico |
|---|---|---|
| Swipe up (mostrar orbe) | `ai-intro-01` | `impactAsync(Light)` |
| Recorrer (press + drag up) | `tick-a-current` por step | `impactAsync(Rigid)` |
| Cerrar (swipe down / 8s) | `close-01` | — |

> El volumen suena aun con el **silencio activado** (`setAudioModeAsync({ playsInSilentMode: true })`).
