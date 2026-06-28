# Liquid Glass en componentes propios — los 3 niveles

El liquid glass del navbar (`NativeTabs`) es "gratis" porque es un **componente nativo de iOS 26**: el `UITabBar` lo dibuja el sistema. Para que **tus** componentes (una ruleta, un FAB, un dock) tengan ese MISMO vidrio real, tenés que elegir en qué **nivel** los construís.

| Nivel | Qué es | Glass | Comportamiento | Rebuild nativo |
|-------|--------|-------|----------------|----------------|
| **1** | RN + `expo-glass-effect` | real (material) | lo programás vos (RN/Skia) | ❌ no |
| **2** | `@expo/ui` (SwiftUI desde React) | real (nativo) | el de Apple (limitado a SwiftUI) | ⚠️ a veces |
| **3** | Módulo nativo propio (Swift/SwiftUI) | real (nativo) | total, 100% nativo | ✅ sí |

Regla de decisión:

- **Ruleta radial custom (estilo orb)** → Nivel 1.
- **Drum picker clásico de iOS** → Nivel 2.
- **Algo único, con glass nativo y control total** → Nivel 3.

---

## Nivel 1 — RN + `expo-glass-effect`

Construís la lógica en React Native (Reanimated para rotación/gestos, **Skia** para el dibujo — como el orb) y le aplicás el **material de vidrio** con `GlassView`. La fusión "gotas" sale de envolver varios `GlassView` en un `GlassContainer` con `spacing`.

```tsx
import { GlassView, GlassContainer } from "expo-glass-effect";

<GlassContainer spacing={12}>
  <GlassView style={{ width: 240, height: 240, borderRadius: 120 }} />   {/* aro */}
  {options.map((o, i) => (
    <GlassView key={o} isInteractive style={radialSlot(i)} />            {/* gajos */}
  ))}
</GlassContainer>
```

- ✅ Material real + fusión de gotas, **sin Swift y sin rebuild** (el módulo ya está en el build).
- ⚠️ La física/comportamiento (snap, ticks, inercia) la programás vos.
- En Cuadra ya tenés media base: el orb es **Skia** y el gesto de rueda con *ticks* hápticos está esbozado en `src/components/navigation/orb-overlay.tsx` (`SELECT_STEP`).

Wrapper de referencia: `src/components/ui/glass-surface.tsx` (detecta `isLiquidGlassAvailable()` y degrada a `BlurView` en Android / iOS viejo).

---

## Nivel 2 — `@expo/ui` (SwiftUI real desde React)

Para **controles estándar de Apple**. Renderiza SwiftUI de verdad desde React. Una ruleta tipo **tambor** = un `Picker` SwiftUI con variante wheel:

```tsx
import { Host, Picker } from "@expo/ui/swift-ui";

<Host style={{ height: 200 }}>
  <Picker
    variant="wheel"
    options={["1h", "2h", "3h"]}
    selectedIndex={index}
    onOptionSelected={({ nativeEvent }) => setIndex(nativeEvent.index)}
  />
</Host>
```

- ✅ Comportamiento y glass 100% nativos (en iOS 26).
- ⚠️ Limitado a lo que SwiftUI ya ofrece (drum picker sí; ruleta radial arbitraria no).
- Skill: `expo:expo-ui`.

---

## Nivel 3 — Módulo nativo propio (Expo Modules + Swift/SwiftUI)

Escribís tu vista en SwiftUI, le ponés el modificador de Apple **`.glassEffect()`** y la exponés a React como un **componente de vista nativa** vía la Expo Modules API. Es exactamente lo que hacen por dentro `NativeTabs` y `expo-glass-effect`.

### Paso 0 — Cuándo

Cuando el Nivel 1 no alcanza (querés comportamiento/animación 100% nativos) y no existe el control en `@expo/ui`. Requiere **build nativo** (no es solo Metro). En Cuadra, ver `docs/running-on-apple-devices.md` para el flujo de build en dispositivo.

### Paso 1 — Scaffold (módulo LOCAL)

Un módulo **local** vive dentro de la app (ideal para algo específico de Cuadra; no hace falta publicar):

```bash
cd apps/mobile
npx create-expo-module@latest --local
# slug: glass-wheel   ·   platform: apple   ·   features: View, ViewEvent
```

Esto crea `modules/glass-wheel/` con:

```
modules/glass-wheel/
  expo-module.config.json
  index.ts                     # binding TS
  ios/
    GlassWheelModule.swift      # definición del módulo
    GlassWheelView.swift        # la ExpoView (host de SwiftUI)
```

> El módulo local se autolinkea. Si configurás `expo.autolinking.nativeModulesDir`, vive ahí; si no, en `modules/`.

### Paso 2 — La vista SwiftUI con `.glassEffect()`

`.glassEffect(_:in:)` es API de **iOS 26** → siempre detrás de `if #available(iOS 26, *)`.

```swift
// ios/GlassWheel.swift  (la UI en SwiftUI puro)
import SwiftUI

// Estado compartido entre React (props) y SwiftUI.
class GlassWheelModel: ObservableObject {
  @Published var options: [String] = []
  @Published var selectedIndex: Int = 0
  var onSelect: ((Int) -> Void)?
}

struct GlassWheel: View {
  @ObservedObject var model: GlassWheelModel

  var body: some View {
    ZStack {
      ForEach(Array(model.options.enumerated()), id: \.offset) { i, label in
        Text(label)
          .rotationEffect(.degrees(Double(i) / Double(max(model.options.count, 1)) * 360))
          .onTapGesture { model.selectedIndex = i; model.onSelect?(i) }
      }
    }
    .frame(width: 240, height: 240)
    .modifier(GlassIfAvailable())   // ← el liquid glass de Apple
  }
}

// Aplica .glassEffect solo en iOS 26; en versiones viejas, fallback.
struct GlassIfAvailable: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      content.glassEffect(.regular, in: .circle)
    } else {
      content.background(.ultraThinMaterial, in: Circle())
    }
  }
}
```

### Paso 3 — La `ExpoView` que hostea SwiftUI

Una `ExpoView` es un `UIView`. Para meter SwiftUI adentro se usa `UIHostingController`:

```swift
// ios/GlassWheelView.swift
import ExpoModulesCore
import SwiftUI

class GlassWheelView: ExpoView {
  private let model = GlassWheelModel()
  private var host: UIHostingController<GlassWheel>!

  // Evento hacia JS (onSelect).
  let onSelect = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true

    model.onSelect = { [weak self] index in
      self?.onSelect(["index": index])
    }

    host = UIHostingController(rootView: GlassWheel(model: model))
    host.view.backgroundColor = .clear
    addSubview(host.view)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  // Setters que llaman los Prop del módulo.
  func setOptions(_ options: [String]) { model.options = options }
  func setSelected(_ index: Int) { model.selectedIndex = index }
}
```

### Paso 4 — La definición del módulo (Prop + Events)

```swift
// ios/GlassWheelModule.swift
import ExpoModulesCore

public class GlassWheelModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GlassWheel")

    View(GlassWheelView.self) {
      Prop("options") { (view: GlassWheelView, options: [String]) in
        view.setOptions(options)
      }
      Prop("selectedIndex") { (view: GlassWheelView, index: Int) in
        view.setSelected(index)
      }
      Events("onSelect")
    }
  }
}
```

### Paso 5 — `expo-module.config.json`

```json
{
  "platforms": ["apple"],
  "apple": { "modules": ["GlassWheelModule"] }
}
```

> iOS usa solo el nombre de la clase. (Android usaría el FQN del package.)

### Paso 6 — El binding en TypeScript

```tsx
// modules/glass-wheel/index.ts
import { requireNativeView } from "expo";
import type { ViewProps } from "react-native";

export type GlassWheelProps = {
  options?: string[];
  selectedIndex?: number;
  onSelect?: (e: { nativeEvent: { index: number } }) => void;
} & ViewProps;

const NativeView = requireNativeView<GlassWheelProps>("GlassWheel");

export function GlassWheel(props: GlassWheelProps) {
  return <NativeView {...props} />;
}
```

Uso en una pantalla:

```tsx
import { GlassWheel } from "../../modules/glass-wheel";

<GlassWheel
  style={{ width: 240, height: 240 }}
  options={["Hoy", "Semana", "Mes"]}
  selectedIndex={0}
  onSelect={({ nativeEvent }) => console.log(nativeEvent.index)}
/>;
```

### Paso 7 — Build nativo

El código Swift NO entra por Metro. Hay que recompilar el dev client:

```bash
cd apps/mobile
npx expo prebuild        # genera/actualiza el proyecto iOS
# luego buildear al dispositivo — ver docs/running-on-apple-devices.md
```

---

## Notas / gotchas

- **`.glassEffect()` es iOS 26+** → siempre con `if #available(iOS 26, *)` + fallback (`.ultraThinMaterial`).
- **`UIHostingController` hay que retenerlo** (propiedad del `ExpoView`); si lo dejás local, SwiftUI deja de actualizar.
- **Props → SwiftUI**: van por un `ObservableObject` (`@Published`); evitá recrear el `rootView` en cada prop (perdés estado/animación).
- **Eventos → JS**: `EventDispatcher` + `Events("...")` en la definición; el nombre debe coincidir.
- **Fusión de gotas a nivel nativo**: en SwiftUI iOS 26 es `GlassEffectContainer { ... }` (equivalente al `GlassContainer` de `expo-glass-effect`).

## Referencias

- Skills: `expo:expo-module` (Nivel 3), `expo:expo-ui` (Nivel 2), `expo:building-native-ui`.
- En el repo: `src/components/ui/glass-surface.tsx` (Nivel 1, con fallback), `docs/running-on-apple-devices.md` (build en dispositivo).
