/**
 * ⚠️ **YA NO ES EL SHADER DEL PATRÓN.** Nace de `monogram/hold-to-focus-liquid-lens` y conserva su
 * idea, pero corrige dos cosas que se vieron sólo al encenderlo en el teléfono:
 *
 *   · **LA CÚPULA ES OPACA.** El patrón mezclaba el velo contra `color.a`, y con una captura en PNG
 *     —que hay que usar, o el fondo transparente sale NEGRO— eso significa que en las zonas VACÍAS
 *     el velo no pintaba nada: la cúpula se veía translúcida y grisácea en vez de blanca. Aquí el
 *     velo se compone como una capa opaca y también SUBE EL ALFA, así que tapa de verdad.
 *   · **NO HAY UN FRENTE VIAJERO APARTE.** Hubo uno y fue un error: al no tener tope, su deformación
 *     y su aberración cromática llegaban hasta la cabecera. El frente ES el canto de la cúpula
 *     subiendo, y ese canto se detiene donde el modelo dice — así que nada se deforma por encima.
 *
 * La deformación tiene DOS zonas, como en la referencia: máxima en el canto (`rim`, donde las
 * tarjetas se doblan) y sostenida DENTRO de la cúpula (`depth`, donde el contenido sigue ondulando
 * mientras se disuelve en blanco).
 */
export const LIQUID_LENS_SKSL = `
uniform shader image;
uniform float2 size;
uniform float strength;
uniform float boundary;
uniform float bow;
uniform float feather;
uniform float displacement;
uniform float blurRadius;
uniform float veil;
uniform float veilStart;
uniform float veilFull;
uniform float3 veilColor;
uniform float chroma;

half4 main(float2 xy) {
  float nx = (xy.x / size.x - 0.5) * 2.0;
  float arch = max(0.0, 1.0 - nx * nx);

  // EL CANTO DE LA CÚPULA. Arqueado: es una cúpula, no una línea.
  float edge = boundary - bow * arch;
  // Cuán DENTRO de la cúpula estamos: 0 por encima del canto, 1 en el fondo.
  float depth = smoothstep(edge - feather, edge + feather, xy.y);
  // La banda del canto, donde el pliegue es máximo.
  float rim = exp(-pow((xy.y - edge) / feather, 2.0));

  // ── DESPLAZAMIENTO ──
  // El término horizontal (nx · …) es lo que INCLINA el texto hacia los costados; sin él las letras
  // se moverían en bloque y no se leería como refracción, sino como un empujón.
  //
  // Y hay dos aportes a propósito: el CANTO dobla fuerte (ahí es donde las tarjetas se arquean) y el
  // INTERIOR sigue ondulando mientras el contenido se disuelve — en la referencia el contenido que
  // ya está dentro de la cúpula sigue deformado, no simplemente borrado.
  float2 uv = xy
    + float2(nx * displacement * rim * 0.55, displacement * arch * rim)
    + float2(nx * displacement * depth * 0.18, displacement * arch * depth * 0.35);

  float radius = blurRadius * depth;
  half4 color = half4(0.0);
  float total = 0.0;
  for (int y = -3; y <= 3; y++) {
    for (int x = -3; x <= 3; x++) {
      float weight = exp(-float(x * x + y * y) / 4.5);
      color += image.eval(uv + float2(float(x), float(y)) * radius * 0.5) * weight;
      total += weight;
    }
  }
  color /= total;

  // ── ABERRACIÓN CROMÁTICA, SÓLO EN EL CANTO ──
  // Rojo y azul se muestrean desplazados sobre la misma dirección en la que empuja el pliegue. Va
  // atada a \`rim\` y no a \`depth\`: repartida por la cúpula entera se leería como un defecto de la
  // pantalla, y por encima del canto no debe existir en absoluto.
  float ca = chroma * rim;
  if (ca > 0.05) {
    float2 dir = float2(nx * 0.35, 1.0) * ca;
    color.r = image.eval(uv + dir).r;
    color.b = image.eval(uv - dir).b;
  }

  // ── EL VELO: UNA RAMPA LINEAL, NO UNA CÚPULA ──
  //
  // ⭐⭐ Esto NO usa \`depth\`, y es la corrección clave. \`depth\` es un \`smoothstep\` alrededor del
  // canto: satura enseguida y deja el mismo blanco desde el canto hasta el fondo. En la referencia
  // el blanco CRECE de forma continua —nada arriba, pleno abajo— y por eso la cabecera se lee
  // limpia mientras el pie desaparece del todo. Una S no puede dar eso; una recta sí.
  //
  // \`veilStart\` es la altura donde el velo empieza a existir, y VIAJA: en reposo está en el suelo
  // (no hay velo) y al pulsar sube hasta cerca del techo. Ese viaje ES la onda que sube.
  float veilRamp = clamp((xy.y - veilStart) / max(veilFull - veilStart, 1.0), 0.0, 1.0);

  // Composición sobre alfa premultiplicado: el velo pinta su color Y sube el alfa, así que tapa
  // también donde la captura estaba vacía. Multiplicarlo por \`color.a\` —como hacía el patrón— lo
  // dejaba invisible justo en las zonas sin contenido, que es donde más se nota.
  float vA = clamp(veil * veilRamp, 0.0, 1.0);
  color.rgb = color.rgb * (1.0 - vA) + half3(veilColor) * vA;
  color.a = color.a + vA * (1.0 - color.a);

  return mix(image.eval(xy), color, strength);
}
`;
