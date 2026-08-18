---
name: cuadra-chat-input
description: >
  The chat input bar of the Cuadra app (`chat-input-bar.tsx`) and, more broadly, HOW TO WORK WITH
  APPLE LIQUID GLASS in this repo — the five things that actually make `GlassView` read as glass,
  and the four that silently kill it. Also owns `PillButton`, the shared pill-shaped button.
  Trigger: building or editing the chat input; adding/adjusting ANY liquid-glass surface
  (`GlassSurface` / `expo-glass-effect`); debugging a glass that "looks flat", whose border stays
  static while the card bounces, whose `isInteractive` bounce never fires, or that drifts/detaches
  when its content grows; adding a pill/chip button anywhere in the app.
---

> **Composes with `cuadra-glass-button`** (round symbol buttons + gotchas 1-9, still authoritative),
> `cuadra-design-system` (palette) and `cuadra-mobile` (structure). This skill is the CHAT INPUT
> recipe + the liquid-glass rules learned on it.

## Reference implementation (read it before inventing)

**`rit3zh/expo-morphing-menu`** → `src/components/bottom-input/` — same `expo-glass-effect` as us.
The load-bearing files: `bottom-input-surface.tsx` (the `GlassView` + its props),
`bottom-input.styles.ts` (the `glass` style), `hooks/use-morph-geometry.ts` (how it animates).

Official docs: https://docs.expo.dev/versions/latest/sdk/glass-effect/

## Liquid glass — the five things that make it read as glass

None of them is the radius or the colour. Measured against the Claude iOS app and the repo above.

1. **`glassEffectStyle="regular"`, NOT `clear`.** `clear` is the transparent variant: over a dark
   background it has nothing to let through and looks like nothing. `regular` is luminous on its own.
   `GlassSurface` takes a `glassEffectStyle` prop (defaults to `regular`).

2. **The tint must be TRANSLUCENT.** `tintColor: "#1c1c1e38"` in dark, white-with-alpha in light —
   8-digit hex, the last two are alpha. An opaque hex goes straight to the native `tintColor` and
   FLATTENS the effect: glass is a *backdrop* effect, so covering it with your own colour leaves a
   flat surface shaped like glass. **Do NOT use `#f2f2f7`** (iOS systemGray6) on a white background:
   it carries a blue component and reads lavender.

3. **The SHADOW is what lifts the slab.** `shadowOpacity: 0.14, shadowRadius: 24, offset: (0,10)`
   (from the reference repo). Without it the plate sits flush against the background and reads as a
   painted rectangle no matter how correct the material is. Put it on the CONTAINER, not on the
   `GlassSurface`: on iOS a shadow plus `overflow: hidden` on the same view clip each other.

4. **Draw NO border.** The native `GlassView` renders its own edge. An SVG `stroke` on top sits
   OUTSIDE the material: it does not deform with it and stays frozen while the card bounces. A
   `style` border is no better — it shows as a white line in the corners. This cost three rounds of
   tuning the *colour* of a border that shouldn't exist.

5. **One glass layer per zone.** Inner controls go SOLID (and darker than the plate). Stacking two
   native `GlassView`s over-darkens — same as gotcha 8 of `cuadra-glass-button`.

## What silently kills it

- **`opacity: 0` on the GlassView OR ANY PARENT** → the effect does not render at all (documented
  by Expo). Fade with `glassEffectStyle: { style, animate: true, animationDuration }` instead.
- **No content behind it.** *"Content must exist behind the GlassView for the effect to render."*
  Over flat black there is nothing to refract — the glass is working, you just can't see it.
- **A fixed `height` + `overflow: hidden`** stop `isInteractive` from deforming the card: the
  material can only squeeze its contents while the outline stays frozen.
- **`transform: scale` on the GlassView or an ancestor** — iOS rasterises the material and stretches
  that bitmap: it over-saturates and goes grainy (gotcha 6). **To make a glass card grow, animate
  `width` / `height` / `borderRadius` as real layout values** with `useAnimatedStyle` on an
  `Animated.createAnimatedComponent(GlassView)`, which is exactly what the reference repo does.
- **`react-native-squircle-view` CANNOT RENDER — por DOS motivos, no uno.** (1) Su `index.js`
  (v1.0.2, línea 15) hace `wrappedStyle = {}` sin declarar la variable → ReferenceError bajo Hermes.
  (2) Re-verificado 2026-08-14: **tampoco está en `ios/Podfile.lock`**, o sea su vista nativa ni
  siquiera está enlazada en el binario — usarlo daría «Unimplemented component» sin un `prebuild` +
  `pod-install` + `run:ios`. Está en `package.json` y su único uso vive en la rama de fallback de
  `glass-surface.tsx` que en iOS 26 nunca corre, por eso nadie lo había notado.
  Para esquinas suavizadas usá **`borderCurve: "continuous"`**, nativo de React Native.
  ⚠️ `borderCurve` **NO se aplica si la vista pide radios DISTINTOS por esquina**: iOS abandona
  `cornerCurve` y recorta con una máscara de arcos de círculo. Si necesitás redondear sólo dos
  esquinas, que recorte un contenedor con radio UNIFORME. (Medido con lupa sobre el render real; a
  tamaño normal los dos cantos se ven idénticos.)
  ⚠️ Sin confirmar si llega a las capas internas del `UIVisualEffectView` — si el suavizado no se
  ve, ése es el sospechoso, no el valor del radio.

## The chat input — structure and why

```tsx
<View style={{ shadow… }}>                    {/* la sombra, fuera del cristal */}
  <GlassSurface glassEffectStyle="regular" isInteractive tint={…}
                style={{ borderRadius: 23, borderCurve: "continuous" }}>
    <View onLayout={medir}>                   {/* QUIEN decide la altura */}
      <TextInput multiline … />
      <View row>{/* + · PillButton · PRO ··· mic · orbe⇄enviar */}</View>
    </View>
  </GlassSurface>
</View>
```

- **The glass WRAPS the content** so it receives touches — `isInteractive` is a material effect
  under the finger, and as an `absoluteFill` background it never gets a single event.
- **Height comes from the measured content**, never from the glass auto-sizing: under Fabric a
  `GlassView` that sizes to growing content mis-measures and the whole zone silently detaches
  (gotcha 9). This field grows 90 → 128pt as you type.
- **The `Pressable` that focuses the field on tapping dead space goes BEHIND the content**
  (`absoluteFill`, first in the tree), never wrapping it: a wrapping Pressable intercepted the touch
  and raced with the multiline TextInput focus, costing extra taps. Documented in the file itself.
- **Orb ⇄ send** swap inside a fixed-size box so layout never shifts; in Figma both occupy literally
  the same slot.
- **The orb and the PRO logo are exported PNGs.** In Figma they are composites of masks with
  `mix-blend-screen` / `plus-lighter` — not reproducible in RN. Never redraw them.

## GlassField — `@/components/ui/glass-field`

La receta de arriba, EMPAQUETADA. Los buscadores de Save tenían que quedar «igual que el input del
chat», y esa receta son SEIS decisiones que sólo funcionan juntas (material, tinte, sombra, borde,
toque, geometría). Copiada tres veces, la primera vez que alguien ajuste una se separan.

```tsx
<GlassField
  radius={52 / 2}                       // una PÍLDORA cierra la cápsula; el defecto (23) es del chat
  style={{ flex: 1 }}                   // el CONTENEDOR: lleva la sombra, el flex, los márgenes
  contentStyle={{ height: 52, flexDirection: "row", paddingHorizontal: 18 }}
>
  <Pressable style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>…</Pressable>
</GlassField>
```

- **El toque va DENTRO del cristal**, nunca envolviéndolo: `isInteractive` es una deformación del
  material bajo el dedo, y un `Pressable` por fuera se queda el evento antes de que el vidrio lo vea.
- ⚠️ **NADA de `alignItems: "center"` en `contentStyle`.** Encoge al hijo a su contenido, y eso costó
  dos defectos a la vez: (1) si ese hijo es el que se MIDE con `measureInWindow`, devuelve la `y` del
  ICONO y no la de la píldora —13pt de error, la copia que viaja nace por debajo y se ve BAJAR antes
  de subir—; (2) los 13pt de arriba y abajo dejan de ser TOCABLES. Deja el `stretch` por defecto y
  que el centrado vertical lo haga el hijo, más adentro. (Ver `cuadra-motion` §6.)
- **Para animar el ancho**, el `withTiming` va en un envoltorio `Animated.View` POR FUERA del
  `GlassField`: la placa se re-dispone como layout real, que es lo que el material necesita. Un
  `scale` la rasteriza.
- **Se esconde por opacidad con un coste conocido**: con `opacity: 0` el vidrio nativo no se dibuja.
  Se acepta cuando la píldora tiene que seguir ocupando su sitio (o la pantalla salta).
- ⚠️ **El vidrio necesita CONTENIDO DETRÁS.** De los tres buscadores de Save sólo el de la rejilla lo
  tiene (la lista scrollea debajo); en la home y en la hoja se apoya sobre un fondo plano y el
  material se lee apagado. **Está funcionando; simplemente no hay nada que refractar.**

## PillButton — `@/components/ui/pill-button`

The shared pill-shaped button. Use it for any secondary action that needs more weight than text and
less than a solid button.

```tsx
<PillButton
  icon={isDark ? <SparkDark width={18} height={18} /> : <SparkLight width={18} height={18} />}
  label={t("chat.freeMessages", { used: "0", total: "5" })}
  accessibilityLabel={t("chat.a11y.freeMessages")}
  onPress={…}
/>
```

- **`icon` is a NODE, not an icon name** — each caller picks its source (lucide, a per-theme SVG, an
  image) without the component knowing any of them.
- **Colours resolve by theme inside**; `height` and `radius` have sane defaults.
- **The gradient id uses `useId()`.** With a fixed id, two instances on screen collide their
  `<Defs>` and one paints the other's edge.
- **The edge is a gradient**, so it cannot be a `borderColor` (RN only takes one flat colour) — it
  is drawn with `react-native-svg`, never `expo-linear-gradient` (its native view is not reliably
  linked into the dev build; same reason as `glass-button.tsx`).
- **The press feedback lives INSIDE the component** (spring + haptic), gated on `onPress` existing —
  a decorative pill (the free-messages counter has no action) must not sink or vibrate. Wrapping it
  in your own `Pressable` does NOT work: this one renders its own, and it captures the touch first.
- **`label` is OPTIONAL — sin él la píldora es SÓLO icono** (el «ver todos» de los rails de Save).
  Dos cosas que van con eso: el `Text` se OMITE del árbol en vez de pintarse vacío (una caja de
  ancho cero sigue aportando el `gap` de la fila y descentra el icono), y `accessibilityLabel` deja
  de ser opcional en la práctica — es lo único que le queda al botón para anunciarse.
- **La rampa del canto es SOMBRA en los extremos y casi nada en el centro** (en claro). Al revés la
  píldora se lee plana y con un cinturón oscuro cruzándola por la mitad. Vale para las tres
  variantes; si agregás una, copiá el sentido, no lo inventes.

**Variante `discount`** — el sello «−45» de las tarjetas de producto de Save. Rojo con letra blanca,
y **NO sigue al tema**: el rojo de rebaja es el mismo en claro y en oscuro, porque atenuarlo en un
tema lo convertiría en «una etiqueta más» justo donde tiene que gritar. Se usa como sello decorativo
(sin `onPress`), montado sobre el canto superior del card — el contenedor tiene que reservarle ese
aire o lo recorta (ver `cuadra-mobile`, promoción a `components/ui`).

> ⚠️ **This section covers the pill's FORM only.** Everything the suggestions carousel added —
> the `brand`/`surface`/`discount` **variants**, `fillOpacity`, `maxWidth`/`maxLines` truncation, and the
> `onHoldReveal`/`onHoldRelease` callbacks — belongs to **`cuadra-chat-suggestions`**, which owns
> the geometry rules that go with them (the height is DERIVED from the allowed line count; the
> width cap goes on the container, not the text). Read that skill before touching those props.

## Measurements — the trap

- **Figma's absolute widths are NOT design measurements.** The frame is 372pt wide, so `323` (row),
  `225` (left group) and `70.16` (right group) are consequences of that frame. On a real phone
  (390-430pt) they must flow: `space-between`, each group hugging its content. What IS literal:
  heights, radii, paddings and button sizes.
- **A `borderRadius` greater than half the side is clamped by RN** into a capsule — Figma's `24.586`
  on a 36pt-tall pill came out elliptical. Keep the container radius and the SVG `rx`/`ry` in ONE
  constant, or the stroke stops matching the fill and a line peeks out at the corners.
- **Never read sizes off a zoomed screenshot.** Cost us an icon at nearly double its size. Pull the
  node with `get_design_context` instead.

## Verification

`tsc --noEmit` and the test suite **do not tell you whether the glass looks like glass**. Both were
green while the screen threw `Render Error`. Screenshot the real render, in BOTH themes, before
saying it is done — see `cuadra-ui-verify`.

```bash
pnpm --filter @cuadra/mobile typecheck
pnpm --filter @cuadra/mobile test
```

## Resources

- `apps/mobile/src/features/aispace/components/chat-input-bar.tsx` — the input, with the reasoning
  for every decision in comments
- `apps/mobile/src/components/ui/pill-button.tsx` — the shared pill button
- `apps/mobile/src/components/ui/glass-surface.tsx` — `GlassSurface` + the `glassEffectStyle` prop
- `.claude/skills/cuadra-glass-button/SKILL.md` — gotchas 1-9, still the authority on glass controls
