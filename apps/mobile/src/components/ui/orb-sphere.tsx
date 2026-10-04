import {
  Blur,
  Canvas,
  Fill,
  Group,
  LinearGradient,
  Paint,
  Path,
  RuntimeShader,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useOrbStore } from "@/store/orb-store";
import { LENS_MOTION } from "./liquid-focus/use-liquid-focus";

// Siri-style AI orb as a 3D GLASS DROP (pure Skia → smooth, anti-aliased edges). The wave is a
// faithful kopiro/siriwave (iOS9) port — additive RGB-gradient lobes, asymmetric (warm top / cool
// bottom), broad flowing waves. A lens RuntimeShader refracts it inside an oval dome: dome
// displacement bends light toward the rim + chromatic aberration + gloss + a thin refractive rim.
const GRAPH_X = 25;
const ATT = 4;
const AMP_FACTOR = 0.8;
const STEP = 0.7;
const ASPECT = 0.85;

type SubCurve = { amp: number; width: number; offset: number; verse: number; speed: number; ampSpeed: number; ampPhase: number };
type Band = "top" | "bottom" | "both";
type WaveColor = { a: string; b: string; dir: 1 | -1; band: Band; curves: SubCurve[] };

const COLORS: WaveColor[] = [
  {
    a: "#FBE800", b: "#B73401", dir: 1, band: "top",
    curves: [
      { amp: 0.95, width: 1.8, offset: -2.0, verse: 1, speed: 0.90, ampSpeed: 0.70, ampPhase: 0.0 },
      { amp: 0.78, width: 1.4, offset: 0.6, verse: -1, speed: 1.08, ampSpeed: 0.50, ampPhase: 1.6 },
      { amp: 0.85, width: 2.4, offset: 2.6, verse: 1, speed: 0.82, ampSpeed: 0.62, ampPhase: 3.0 },
    ],
  },
  {
    a: "#28F6E7", b: "#0088FF", dir: -1, band: "both",
    curves: [
      { amp: 0.92, width: 1.6, offset: -2.6, verse: -1, speed: 1.02, ampSpeed: 0.55, ampPhase: 0.8 },
      { amp: 0.75, width: 2.0, offset: 0.0, verse: 1, speed: 0.88, ampSpeed: 0.66, ampPhase: 2.3 },
      { amp: 0.82, width: 1.3, offset: 2.0, verse: -1, speed: 1.14, ampSpeed: 0.50, ampPhase: 4.1 },
    ],
  },
  {
    a: "#B7FF77", b: "#357B00", dir: 1, band: "bottom",
    curves: [
      { amp: 0.88, width: 1.5, offset: -1.4, verse: 1, speed: 1.05, ampSpeed: 0.60, ampPhase: 1.0 },
      { amp: 0.74, width: 2.2, offset: 1.1, verse: -1, speed: 0.92, ampSpeed: 0.72, ampPhase: 2.9 },
      { amp: 0.85, width: 1.7, offset: 3.0, verse: 1, speed: 0.96, ampSpeed: 0.52, ampPhase: 5.0 },
    ],
  },
  {
    a: "#E85DE8", b: "#360076", dir: -1, band: "bottom",
    curves: [
      { amp: 0.90, width: 1.7, offset: -3.0, verse: -1, speed: 0.98, ampSpeed: 0.58, ampPhase: 0.4 },
      { amp: 0.76, width: 1.3, offset: -0.4, verse: 1, speed: 1.10, ampSpeed: 0.64, ampPhase: 2.0 },
      { amp: 0.84, width: 2.1, offset: 1.6, verse: -1, speed: 0.86, ampSpeed: 0.54, ampPhase: 3.7 },
    ],
  },
];

function buildWave(wave: WaveColor, t: number, level: number, w: number, h: number) {
  "worklet";
  const b = Skia.PathBuilder.Make();
  // Each band crosses the centre line a little so warm/cool overlap and blend (no dark seam).
  const OVERLAP = h * 0.02;
  let center = h * 0.6;
  if (wave.band === "top") center += OVERLAP;
  else if (wave.band === "bottom") center -= OVERLAP;
  const heightMax = h * 0.5;
  const GAIN = 3.6;
  const WIDTH_SCALE = 4.4; // broad, flowing waves
  const K = wave.curves.length;

  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    if (sign > 0 && wave.band === "bottom") continue;
    if (sign < 0 && wave.band === "top") continue;
    let first = true;
    for (let i = -GRAPH_X; i <= GRAPH_X; i += STEP) {
      let yr = 0;
      for (let ci = 0; ci < K; ci++) {
        const c = wave.curves[ci];
        const tt = 4 * (-1 + (ci / (K - 1)) * 2) + c.offset;
        const x = i / (c.width * WIDTH_SCALE) - tt;
        const amp = c.amp * (0.55 + 0.45 * Math.sin(t * c.ampSpeed + c.ampPhase));
        const a = ATT / (ATT + x * x);
        yr += Math.abs(amp * Math.sin(c.verse * x - t * c.speed) * a);
      }
      yr /= K;
      const e = ATT / (ATT + (i / GRAPH_X) * (i / GRAPH_X) * 4);
      const y = AMP_FACTOR * heightMax * GAIN * level * yr * (e * e);
      const px = (w * (i + GRAPH_X)) / (GRAPH_X * 2);
      const py = center - sign * y;
      if (first) {
        b.moveTo(px, py);
        first = false;
      } else {
        b.lineTo(px, py);
      }
    }
    b.close();
  }
  return b.build();
}

// Glass lens: samples the rendered wave (`image`) and refracts it inside the oval dome.
const GLASS = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 resolution;

half4 main(float2 fragCoord) {
  float2 res = resolution;
  float2 uv = fragCoord / res;
  float2 p = uv * 2.0 - 1.0;
  // Superellipse → iOS-style squircle (continuous-curvature "corner smoothing").
  float N = 2.2;
  float se = pow(pow(abs(p.x), N) + pow(abs(p.y), N), 1.0 / N);
  if (se > 1.0) { return half4(0.0); }
  float s2 = se * se;
  float z = sqrt(max(0.0, 1.0 - s2));

  float bend = 0.22;
  float2 suv = uv - p * (1.0 - z) * bend;
  float ca = 0.03 * (1.0 - z);

  half4 sc = image.eval(suv * res);
  half cr = image.eval((suv + p * ca) * res).r;
  half cb = image.eval((suv - p * ca) * res).b;
  half3 col = half3(cr, sc.g, cb);

  // Glass highlights fade out toward the TOP so the black cap stays pure black (no coloured rim).
  float lower = smoothstep(-0.6, 0.8, p.y); // 0 at top → 1 lower half

  float fres = pow(1.0 - z, 3.0);
  col += half3(0.45, 0.55, 0.85) * fres * 0.18 * lower;
  float sheen = smoothstep(0.15, -0.8, p.y) * z;
  col += half3(0.90, 0.95, 1.0) * sheen * 0.06;
  col *= (0.78 + 0.22 * z);

  // Soft refractive glass border (wide → smooth), only on the lower half.
  float rim = smoothstep(0.80, 0.95, s2) * (1.0 - smoothstep(0.95, 1.0, s2)) * lower;
  col += half3(0.75, 0.85, 1.0) * rim * 0.35;

  // Preserve sampled alpha (translucent body); the smooth rim carries the lower edge → no jaggies.
  float edge = 1.0 - smoothstep(0.84, 1.0, s2);
  float a = clamp(sc.a + rim * 0.55, 0.0, 1.0) * edge;
  return half4(col, a);
}
`);

/** Cuánto se contrae el orbe al mantenerlo pulsado. Del ~0.82× medido en la referencia se baja a
 *  0.10 porque allí la píldora era ANCHA y aquí el control ya es redondo: la misma proporción sobre
 *  un círculo se lee como un salto, no como un asentamiento. */
const FOCUS_CONTRACT = 0.10;
const FOCUS_RELEASE_MS = 260;
/** El anillo asoma por fuera del orbe; si quedara por dentro lo taparía el propio orbe. */
const HALO_PAD = 5;
const HALO_WIDTH = 1.5;
/** Un halo, no un borde: tiene que insinuarse, no dibujar un contorno. Siempre presente. */
const HALO_OPACITY = 0.55;
/** Mientras se mantiene pulsado compite con un fondo esmerilado y pide algo más de cuerpo. */
const HALO_OPACITY_FOCUS = 0.85;

// ── EL ORBE PENSANDO ──────────────────────────────────────────────────────────────────────────
//
// ⭐⭐ **El orbe ES el «pensando»; ya no hay píldora que lo sustituya.** Antes el control se retiraba
// y entraba un `PillButton` con la palabra escrita — dos elementos disputándose el mismo sitio, y el
// relevo entre ellos costó tres defectos distintos. Un orbe que se agita dice lo mismo sin cambiar
// de objeto, y no hay relevo que pueda romperse.
//
// El estado tiene DOS palancas y hacen falta las dos: la ENERGÍA dice cuánto se agita el agua y el
// TEMPO dice a qué velocidad. Sólo con energía se ve una ola grande y lenta —lo contrario de estar
// ocupado—; sólo con tempo, un temblor sin cuerpo.

/** Reposo: el agua respira. Es el valor con el que nace `level`. */
const IDLE_LEVEL = 0.6;
/**
 * Energía SOSTENIDA mientras piensa. Por encima del reposo y por debajo del pico de un toque (1.18),
 * que es un golpe y decae: esto tiene que poder mantenerse sin saturar la onda.
 */
const THINK_LEVEL = 1.0;
/** El tempo del reposo. Uno, porque es el que define la unidad. */
const IDLE_SPEED = 1;
/** Cuántas veces más rápido late mientras piensa. */
const THINK_SPEED = 2.6;
/** La aceleración se OYE si es un salto: se entra y se sale del estado, no se conmuta. */
const THINK_RAMP_MS = 420;
/**
 * TOPE del paso de tiempo entre fotogramas.
 *
 * ⚠️ Al volver de segundo plano —o al reactivar el callback— `timestamp` da un salto de segundos. Sin
 * tope, la fase avanzaría ese salto entero de golpe y la onda se teletransportaría. Un treintavo es
 * un fotograma lento: nunca estorba a un paso real.
 */
const MAX_DT = 1 / 30;

export function OrbSphere({
  size = 64,
  visible = true,
  thinking = false,
}: {
  size?: number;
  visible?: boolean;
  /** El agente está trabajando: el agua se agita más y MÁS RÁPIDO hasta que llega la respuesta. */
  thinking?: boolean;
}) {
  const w = size;
  const h = size * ASPECT;
  const PAD = size * 0.35; // room around the orb for the glow bloom
  const CW = w + PAD * 2;
  const CH = h + PAD * 2;

  const level = useSharedValue(IDLE_LEVEL); // wave energy (idle ≈ 0.6, swells on tap)
  /**
   * EL TEMPO de la onda, como multiplicador del tiempo. 1 en reposo.
   *
   * ⚠️⚠️ **Y por eso la fase se ACUMULA en vez de escalar el reloj — aquí está la trampa entera.**
   * Lo obvio es pasarle `timestamp * speed` a `buildWave`, y es lo que revienta: `timestamp` lleva
   * MILLONES de milisegundos acumulados desde que arrancó la app, así que multiplicarlo por 2.6
   * salta la fase varios millones de unidades de golpe. La onda no acelera: se TELETRANSPORTA a otra
   * forma, y encima el salto es distinto cada vez porque depende de cuánto lleve la app abierta.
   *
   * Integrando (`phase += dt · speed`) el tempo puede cambiar cuando quiera sin discontinuidad: la
   * fase es continua por construcción y la rampa de `speed` se oye como una aceleración de verdad.
   */
  const speed = useSharedValue(IDLE_SPEED);
  /** La fase acumulada de la onda, en segundos «propios» del orbe — NO el reloj de la app. */
  const phase = useSharedValue(0);
  /** El `timestamp` del fotograma anterior. 0 = todavía no hay anterior del que restar. */
  const lastFrame = useSharedValue(0);
  const p0 = useSharedValue(Skia.Path.Make());
  const p1 = useSharedValue(Skia.Path.Make());
  const p2 = useSharedValue(Skia.Path.Make());
  const p3 = useSharedValue(Skia.Path.Make());
  const paths = [p0, p1, p2, p3];

  // Drive the wave paths from Reanimated's global frame timestamp. We intentionally avoid
  // `useDerivedValue` with Skia's clock because Reanimated v4 can crash with
  // "animation.onStart is not a function" when mixing the two value systems.
  // `autostart: false` — el arranque lo decide `visible` (ver el efecto de abajo).
  const frame = useFrameCallback(({ timestamp }) => {
    "worklet";
    // `timestamp` pertenece al frame global de Reanimated y no se reinicia al retargetear la pose.
    // De él sólo se usa la DIFERENCIA: la fase es nuestra y avanza al ritmo que marque `speed`.
    const previous = lastFrame.value;
    lastFrame.value = timestamp;
    const dt = previous === 0 ? 0 : Math.min((timestamp - previous) / 1000, MAX_DT);
    phase.value += dt * speed.value;
    const time = phase.value;
    p0.value = buildWave(COLORS[0], time, level.value, w, h);
    p1.value = buildWave(COLORS[1], time, level.value, w, h);
    p2.value = buildWave(COLORS[2], time, level.value, w, h);
    p3.value = buildWave(COLORS[3], time, level.value, w, h);
  }, false);

  // Sin esta guarda el callback corre SIEMPRE: cuatro paths por frame (~240/s) cuyo resultado no
  // se ve. `visible` solo anima opacidad/escala/translateY —oculta el orb, no detiene el trabajo—
  // y OrbSphere vive en la tab bar, así que el coste se pagaba en TODAS las pantallas.
  // `frame` es estable (useRef interno) y reanimated re-aplica `isActive` al re-registrar el
  // callback, así que este setActive sobrevive a los re-renders.
  useEffect(() => {
    // ⚠️ Se olvida el fotograma anterior ANTES de reactivar: mientras estuvo parado el reloj global
    // siguió corriendo, así que ese `previous` describe un intervalo que el orbe no vivió. El tope
    // de `MAX_DT` ya lo acotaría, pero acotar un dato falso sigue siendo usarlo.
    if (visible) lastFrame.value = 0;
    frame.setActive(visible);
  }, [visible, frame, lastFrame]);

  // Tap → swell the wave then settle (water-style: quick rise, slow ease back).
  const pulse = useOrbStore((s) => s.pulse);
  useEffect(() => {
    if (pulse === 0) return;
    // ⚠️ No hace falta guardar contra `thinking`: `bump()` sólo lo emite la barra con el dedo
    // APOYADO, y con el dedo apoyado no se piensa todavía. Si algún día se emitiera desde otro
    // sitio, este `withSequence` pisaría el estado sostenido — y entonces sí haría falta la guarda.
    level.value = withSequence(
      withTiming(1.18, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withTiming(IDLE_LEVEL, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
    );
  }, [pulse, level]);

  // ⭐⭐ **PENSAR ES AGITARSE MÁS Y MÁS RÁPIDO.** Las dos palancas suben juntas y con la misma rampa,
  // así que se lee como UN estado y no como dos ajustes.
  //
  // ⚠️ Esto CANCELA la cola del último `bump` —un `withSequence` que tarda 1,5 s en volver al
  // reposo—, y es lo correcto: al soltar el dedo el orbe deja de estar respondiendo a un toque y
  // pasa a estar ocupado. Sin este relevo, el primer segundo de «pensando» seguiría desacelerando.
  useEffect(() => {
    level.value = withTiming(thinking ? THINK_LEVEL : IDLE_LEVEL, {
      duration: THINK_RAMP_MS,
      easing: Easing.inOut(Easing.quad),
    });
    speed.value = withTiming(thinking ? THINK_SPEED : IDLE_SPEED, {
      duration: THINK_RAMP_MS,
      easing: Easing.inOut(Easing.quad),
    });
  }, [thinking, level, speed]);

  // Squircle outline for the lower rim glow (matches the superellipse body).
  const ringPath = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    const Np = 4.5;
    const cx = PAD + w / 2;
    const cy = PAD + h / 2;
    const rx = w / 2 - 1;
    const ry = h / 2 - 1;
    const STEPS = 72;
    for (let k = 0; k <= STEPS; k++) {
      const ang = (k / STEPS) * Math.PI * 2;
      const ct = Math.cos(ang);
      const st = Math.sin(ang);
      const px = cx + rx * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / Np);
      const py = cy + ry * Math.sign(st) * Math.pow(Math.abs(st), 2 / Np);
      if (k === 0) pb.moveTo(px, py);
      else pb.lineTo(px, py);
    }
    pb.close();
    return pb.build();
  }, [w, h, PAD]);

  // Animation is split into three channels (opacity / scale / translateY) for independent control.
  const op = useSharedValue(visible ? 1 : 0); // opacity
  const sc = useSharedValue(visible ? 1 : 0.5); // scale
  const ty = useSharedValue(visible ? 0 : 16); // translateY (px); + = down, toward the navbar
  const mounted = useRef(false);
  useEffect(() => {
    // On first run just snap to the resting state — never animate on mount (would flash the orb in).
    if (!mounted.current) {
      mounted.current = true;
      op.value = visible ? 1 : 0;
      sc.value = visible ? 1 : 0.5;
      ty.value = visible ? 0 : 16;
      return;
    }
    if (visible) {
      // ENTRANCE — reset to the small/low start while still invisible (op is 0 now, so the snap is
      // never seen), then pop up with a juicy under-damped bounce (overshoots past 1).
      sc.value = 0.5;
      ty.value = 16;
      op.value = withTiming(1, { duration: 120 });
      sc.value = withSpring(1, { damping: 5.5, stiffness: 175, mass: 0.9, overshootClamping: false });
      ty.value = withSpring(0, { damping: 6.5, stiffness: 190, mass: 0.85, overshootClamping: false });
    } else {
      // EXIT — the exact INVERSE of the entrance (same springs), targeting the hidden rest state:
      // shrink back to 0.5, sink the 16px back down toward the logo, and fade out. Because it mirrors
      // the appear it stays in the orb's home spot and never overlaps the bar / the tab icons.
      op.value = withTiming(0, { duration: 120 });
      sc.value = withSpring(0.5, { damping: 5.5, stiffness: 175, mass: 0.9, overshootClamping: false });
      ty.value = withSpring(16, { damping: 6.5, stiffness: 190, mass: 0.85, overshootClamping: false });
    }
  }, [visible, op, sc, ty]);

  // Press / hold → the orb wobbles fluidly (scale pulse + tiny side sway) and KEEPS wobbling while
  // held; on release it settles with a little bounce. No haptic — this is the visual "vibration".
  const pressing = useOrbStore((s) => s.pressing);
  // ── EL MORPH ────────────────────────────────────────────────────────────────────────────────
  //
  // ⭐ **Se traduce el MECANISMO, no la forma.** En Monogram la píldora ancha del micrófono se
  // ESTRECHA hasta un botón circular y gana un halo claro (medido entre `frames/w1/f001` y
  // `f015`: ~110 → ~90 px, o sea ~0.82×). Nosotros no tenemos píldora —el orbe ya es redondo—, así
  // que copiar «píldora → círculo» sería copiar SU pantalla, no su idea. Lo que hace legible el
  // gesto es otra cosa: **el control se CONTRAE y se recorta contra el fondo**, y eso sí se traduce.
  //
  // El control LIDERA al fondo, como en los fotogramas: termina su asentamiento mientras la
  // cúpula todavía está subiendo. El tiempo vive junto al de la lente para conservar esa relación.
  const focus = useSharedValue(0); // 0 en reposo, 1 mientras se mantiene pulsado
  const wob = useSharedValue(1); // respiración mínima alrededor de la pose contraída
  useEffect(() => {
    focus.value = pressing
      ? withTiming(1, {
          duration: LENS_MOTION.controlMs,
          easing: Easing.bezier(0.2, 0, 0, 1),
        })
      : withTiming(0, { duration: FOCUS_RELEASE_MS, easing: Easing.bezier(0.2, 0, 0, 1) });
    if (pressing) {
      // Respiración contenida. El 1.05↔0.98 anterior peleaba con la contracción y se leía como dos
      // órdenes simultáneas; aquí la variación es menor de 2% y sólo empieza a sentirse al reposar.
      wob.value = withRepeat(
        withSequence(
          withTiming(1.014, { duration: 760, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.994, { duration: 760, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else {
      // Sin rebote al soltar: vuelve a su pose con la misma cola suave que la cúpula.
      wob.value = withTiming(1, {
        duration: FOCUS_RELEASE_MS,
        easing: Easing.bezier(0.2, 0, 0, 1),
      });
    }
  }, [pressing, wob, focus]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateY: ty.value },
      // La respiración sigue existiendo: ahora oscila ALREDEDOR del tamaño contraído.
      { scale: sc.value * wob.value * (1 - focus.value * FOCUS_CONTRACT) },
    ],
  }));

  // ⭐ EL HALO ESTÁ SIEMPRE, no sólo al pulsar. Atado a `focus` aparecía y desaparecía con el dedo,
  // y eso lo convertía en un efecto de pulsación; es un BORDE del orbe, parte de cómo se recorta
  // contra lo que tenga detrás. Se refuerza un poco al mantener pulsado —ahí compite con un fondo
  // esmerilado y necesita algo más de cuerpo— pero nunca baja de su valor en reposo.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: HALO_OPACITY + focus.value * (HALO_OPACITY_FOCUS - HALO_OPACITY),
  }));

  if (!GLASS) return null;

  return (
    <Animated.View style={[{ width: w, height: h }, containerStyle]}>
      {/* EL HALO. En la referencia el control activo se recorta con un anillo claro contra el
          fondo ya esmerilado — es lo que dice «esto sigue vivo, lo de atrás no». Va ANTES del
          Canvas para quedar detrás del orbe, y crece un pelo por fuera para asomar por el canto. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: -HALO_PAD,
            top: -HALO_PAD,
            width: w + HALO_PAD * 2,
            height: h + HALO_PAD * 2,
            borderRadius: (w + HALO_PAD * 2) / 2,
            borderWidth: HALO_WIDTH,
            borderColor: "#FFFFFF",
          },
          haloStyle,
        ]}
      />
      {/* Soft animated colour bloom — a heavily-blurred, faint copy of the wave behind the orb,
          so the glow follows the wave's colours and motion (subtle). */}
      <Canvas style={{ position: "absolute", left: -PAD, top: -PAD, width: CW, height: CH }}>
        <Group
          transform={[{ translateX: PAD }, { translateY: PAD }]}
          layer={
            <Paint>
              <Blur blur={size * 0.16} />
            </Paint>
          }
        >
          {COLORS.map((wave, i) => (
            <Path key={i} path={paths[i]} style="fill" blendMode="plus" opacity={0.42}>
              <LinearGradient
                start={vec(wave.dir === 1 ? 0 : w, h / 2)}
                end={vec(wave.dir === 1 ? w : 0, h / 2)}
                colors={[wave.a, wave.b]}
              />
            </Path>
          ))}
        </Group>
        {/* Small soft glow hugging the rim so the edge doesn't cut off abruptly. */}
        <Group layer={
          <Paint>
            <Blur blur={size * 0.09} />
          </Paint>
        }>
          <Path path={ringPath} style="stroke" strokeWidth={size * 0.1}>
            {/* Transparent at the top so the black cap has no rim glow; light toward the bottom. */}
            <LinearGradient
              start={vec(0, PAD)}
              end={vec(0, PAD + h)}
              positions={[0, 0.45, 1]}
              colors={["rgba(170,200,255,0)", "rgba(170,200,255,0)", "rgba(170,200,255,0.55)"]}
            />
          </Path>
        </Group>
      </Canvas>

      <Canvas style={{ width: w, height: h }}>
        <Group layer={
          <Paint>
            <RuntimeShader source={GLASS} uniforms={{ resolution: [w, h] }} />
          </Paint>
        }>
          {/* Glass body: opaque BLACK on top → translucent toward the bottom (app shows through). */}
          <Fill>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, h)}
              positions={[0, 0.52, 0.8, 1]}
              colors={["rgba(2,2,5,1.0)", "rgba(3,4,8,1.0)", "rgba(8,10,16,0.45)", "rgba(11,14,21,0.24)"]}
            />
          </Fill>
          {/* Additive RGB-gradient wave (soft glow). */}
          <Group layer={
            <Paint>
              <Blur blur={w * 0.018} />
            </Paint>
          }>
            {COLORS.map((wave, i) => (
              <Path key={i} path={paths[i]} style="fill" blendMode="plus" opacity={0.9}>
                <LinearGradient
                  start={vec(wave.dir === 1 ? 0 : w, h / 2)}
                  end={vec(wave.dir === 1 ? w : 0, h / 2)}
                  colors={[wave.a, wave.b]}
                />
              </Path>
            ))}
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
}
