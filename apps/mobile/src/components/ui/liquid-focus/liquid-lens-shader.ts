/**
 * ⚠️ **YA NO ES EL SHADER DEL PATRÓN.** Nace de `monogram/hold-to-focus-liquid-lens` y conserva su
 * idea, pero corrige dos cosas que se vieron sólo al encenderlo en el teléfono:
 *
 *   · **LA CÚPULA ES VIDRIO, NO BLANCO PLANO.** El patrón mezclaba el velo contra `color.a`; aquí la
 *     captura sigue siendo opaca para evitar fantasmas, pero el velo conserva suficiente fondo
 *     visible para que las tarjetas sigan leyéndose como material bajo vidrio.
 *   · **NO HAY UN FRENTE VIAJERO APARTE.** Hubo uno y fue un error: al no tener tope, su deformación
 *     llegaba hasta la cabecera. El frente ES el canto de la cúpula subiendo, y ese canto se detiene
 *     donde el modelo dice — así que nada se deforma por encima.
 *
 * El canto cambia de forma mientras respira y una rampa vertical monótona dobla el contenido sin
 * refracción lateral ni doble muestreo. Sólo el menisco modula ligeramente sus canales para el
 * glitch cromático observado; debajo, blur y velo forman el glass.
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
uniform float veilFull;
uniform float3 veilColor;
uniform float edgeTilt;
uniform float ripple;
uniform float wavePhase;
uniform float release;
uniform float2 dropOrigin;
uniform float dropRadius;
uniform float dropWidth;
uniform float dim;
uniform float seal;

half4 main(float2 xy) {
  float nx = (xy.x / size.x - 0.5) * 2.0;
  float arch = max(0.0, 1.0 - nx * nx);

  // La respiración cambia la FORMA: arco, ladeo y una onda secundaria. \`arch\` apaga esa onda en
  // los costados para no abrir una discontinuidad contra el borde de pantalla.
  float edge = boundary - bow * arch
    + edgeTilt * nx
    + ripple * sin(nx * 3.4 + wavePhase) * arch;
  // Cuán DENTRO de la cúpula estamos: 0 por encima del canto, 1 en el fondo.
  float depth = smoothstep(edge - feather, edge + feather, xy.y);
  // Al soltar, una onda radial nace donde está el orbe y se abre por toda la pantalla. Dos lóbulos
  // (empuje y retorno) producen el gesto de una gota cayendo en agua; una simple banda luminosa se
  // leería como un escáner. La envolvente apaga ambos extremos sin callbacks por fotograma.
  float2 fromDrop = xy - dropOrigin;
  float dropDistance = length(fromDrop);
  float safeDropWidth = max(dropWidth, 1.0);
  float dropBand = (dropDistance - dropRadius) / safeDropWidth;
  float echoBand = (dropDistance - (dropRadius - dropWidth * 1.55)) / (safeDropWidth * 1.15);
  // El frente gana cuerpo enseguida y lo conserva durante el recorrido. Una sinusoide lo hacía
  // casi invisible al nacer y al acercarse al techo: en movimiento se percibía como un fade.
  float releaseIn = smoothstep(0.0, 0.10, release);
  float releaseOut = 1.0 - smoothstep(0.84, 1.0, release);
  float dropEnvelope = releaseIn * releaseOut;
  float leadingRing = exp(-dropBand * dropBand * 0.92);
  float echoRing = exp(-echoBand * echoBand * 1.20) * 0.66;
  float dropGlass = clamp(leadingRing + echoRing, 0.0, 1.0) * dropEnvelope;

  // La onda no acompaña a una retirada global: ES la retirada. Detrás del frente radial la lente
  // ya no existe; delante sigue completa. Esto produce el gesto de una gota abriendo el agua desde
  // el orbe hacia arriba, en lugar de desvanecer toda la pantalla al mismo tiempo.
  float releaseGate = smoothstep(0.001, 0.025, release);
  float clearBehindWave = smoothstep(
    dropRadius - dropWidth * 1.15,
    dropRadius + dropWidth * 0.30,
    dropDistance
  );
  float lensPresence = mix(1.0, clearBehindWave, releaseGate);

  // ── DESPLAZAMIENTO ──
  // ⭐ La coordenada vertical sólo AVANZA con depth. La versión anterior añadía una campana
  // positiva basada en rim; al subir y luego bajar esa campana, uv.y podía devolverse y muestrear
  // la misma línea dos veces —un reflejo literal. Esta rampa conserva la curva y el estiramiento,
  // pero es monótona: ningún píxel del fondo se repite.
  // Durante TODO el ciclo NO hay refracción óptica: nada se desplaza lateralmente, separa color ni
  // empuja radialmente una segunda imagen. La deformación es una sola rampa vertical MONÓTONA. Su
  // amplitud cambia a lo ancho con una onda positiva, así el contenido fluye en vez de trasladarse
  // como un bloque, pero ninguna coordenada retrocede ni repite una línea del fondo.
  float verticalFlow = arch * (0.82 + 0.18 * sin(nx * 4.6 + wavePhase * 1.3));
  // La liberación añade un pliegue VERTICAL ancho y de poca amplitud. Es una sola muestra que
  // nunca se desplaza de lado ni se mezcla con el original: se siente acuoso sin volver a crear la
  // refracción/fantasma que se eliminó. La amplitud es pequeña frente al ancho del anillo, por lo
  // que la coordenada sigue avanzando y no repite líneas del fondo.
  float releaseFlow = dropGlass * dropWidth * 0.18 * (0.76 + 0.24 * arch);
  float2 uv = xy
    + float2(0.0, displacement * verticalFlow * depth * 0.68 * lensPresence + releaseFlow);

  // Los dos anillos de liberación son VIDRIO: viajan como blur/densidad, no como refracción. Esto
  // hace visible la gota incluso sobre zonas lisas y evita el salto tardío del borrado anterior.
  float blurField = max(depth * lensPresence, dropGlass);
  float radius = blurRadius * blurField;
  half4 color = image.eval(uv);
  // 25 muestras: conserva un blur continuo y reduce casi a la mitad el coste del kernel anterior
  // de 49 muestras, importante porque la onda ocupa el viewport completo durante la liberación.
  // Fuera del vidrio evitamos el kernel entero: ahí sólo hace falta la muestra original.
  if (radius > 0.05) {
    color = half4(0.0);
    float total = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        float weight = exp(-float(x * x + y * y) / 3.2);
        // Las muestras deben SOLAPARSE. Con 0.65 quedaban separadas varios puntos y cada letra se
        // veía 25 veces como una cuadrícula; 0.20 mantiene un soporte parecido con un kernel denso.
        color += image.eval(uv + float2(float(x), float(y)) * radius * 0.20) * weight;
        total += weight;
      }
    }
    color /= total;
  }

  // ── EL VELO: CRECE DESDE EL MISMO MENISCO ──
  //
  // ⭐⭐ Esto NO usa \`depth\`, y es la corrección clave. \`depth\` es un \`smoothstep\` alrededor del
  // canto: satura enseguida y deja el mismo blanco desde el canto hasta el fondo. En la referencia
  // el blanco CRECE de forma continua —nada arriba, pleno abajo— y por eso la cabecera se lee
  // limpia mientras el pie desaparece del todo. Una S no puede dar eso; una recta sí.
  //
  // La versión anterior tenía otro frente para el blanco y podía llevarlo al techo mientras el
  // pliegue seguía a media pantalla. Ahora ambos nacen del MISMO \`edge\`.
  // El color ya está presente en la parte ALTA del menisco; desde ahí gana densidad hacia el pie.
  // Empezarlo casi dentro del borde hacía que arriba pareciera transparente y que todo el color se
  // acumulara abajo, justo lo contrario de la lectura de la referencia.
  float veilStart = edge - feather * 1.05;
  float veilDepth = clamp((xy.y - veilStart) / max(veilFull - veilStart, 1.0), 0.0, 1.0);
  float veilGate = smoothstep(edge - feather * 1.20, edge + feather * 0.25, xy.y);
  // El 46% inicial da cuerpo al borde ALTO. Sin este suelo, la rampa matemática empezaba en cero
  // y el menisco se leía transparente aunque el fondo de la cúpula ya fuera blanco/oscuro.
  float veilRamp = mix(0.46, 1.0, veilDepth) * veilGate;

  // Composición sobre alfa premultiplicado: el velo pinta su color Y sube el alfa, así que tapa
  // también donde la captura estaba vacía. Multiplicarlo por \`color.a\` —como hacía el patrón— lo
  // dejaba invisible justo en las zonas sin contenido, que es donde más se nota.
  // La posición todavía recorre toda la entrada lenta, pero el MATERIAL gana cuerpo apenas asoma.
  // Si aquí se usa strength directamente, durante la primera mitad de los 480 ms la cúpula es
  // casi transparente: se ve primero sólo el oscurecimiento global y luego aparece una placa. En
  // Monogram el pequeño casquete que nace abajo ya tiene densidad de vidrio y lo que crece es su
  // extensión. Esta rampa separa esas dos ideas sin crear otro frente ni una segunda imagen.
  float materialStrength = smoothstep(0.015, 0.18, strength);
  float lensMix = materialStrength * lensPresence
    * smoothstep(edge - feather * 1.18, edge + feather * 0.62, xy.y);
  float releaseVeil = veil * dropGlass * 0.42;
  // ⭐ EL SELLADO. Mientras se dicta, el velo es una RAMPA atada al menisco —blanco pleno abajo,
  // nada arriba— y por eso la cabecera se lee limpia. Pero una rampa NO PUEDE tapar una navegación
  // por debajo: al saltar al chat se vería la pantalla nueva asomando por arriba.
  //
  // ⚠️ Se resuelve con una MEZCLA hacia el velo pleno, sin tocar veilRamp ni lensMix: esa
  // matemática está calibrada contra la referencia y cualquier retoque ahí cambiaría cómo se lee el
  // menisco durante el dictado, que es lo que más se mira. Sellar es otro trabajo del mismo velo.
  float vA = clamp(mix(veil * veilRamp * lensMix + releaseVeil, veil, seal), 0.0, 1.0);
  color.rgb = color.rgb * (1.0 - vA) + half3(veilColor) * vA;

  // El pequeño glitch cromático de Monogram vive ÚNICAMENTE en el menisco. No vuelve a muestrear
  // la imagen ni separa geometría RGB; modula los canales de la única muestra ya deformada. Dos
  // armónicos evitan que el patrón quede congelado mientras la cúpula respira.
  float rimCoordinate = (xy.y - edge) / max(feather * 0.72, 1.0);
  float rimBand = exp(-rimCoordinate * rimCoordinate * 2.2)
    * arch * materialStrength * lensPresence;
  float glitchWave = sin(nx * 16.0 + wavePhase * 1.7)
    + 0.45 * sin(nx * 29.0 - wavePhase * 2.3);
  float chroma = rimBand * glitchWave * 0.032;
  color.rgb = clamp(
    color.rgb + half3(chroma * 0.72, -abs(chroma) * 0.16, -chroma * 0.82),
    half3(0.0),
    half3(1.0)
  );

  // En superficies lisas, blur y velo del mismo color pueden hacer que el frente móvil desaparezca.
  // Este sombreado muy corto pertenece al CANTO del agua: gris tenue en claro y una elevación
  // neutra en oscuro. No añade brillo especular, otra imagen ni desplazamiento lateral.
  float veilLuma = dot(veilColor, float3(0.2126, 0.7152, 0.0722));
  float edgeNeutral = mix(0.24, 0.62, step(0.5, veilLuma));
  float edgeAmount = leadingRing * dropEnvelope * 0.09;
  color.rgb = mix(color.rgb, half3(edgeNeutral), edgeAmount);

  // ⭐ UNA SOLA MUESTRA por píxel. Mezclar la muestra original con la deformada, aun con alfa 1,
  // vuelve a dibujar cada letra en dos posiciones. La atenuación cambia sólo luminancia: fuera del
  // material baja el contexto y dentro recupera luz, sin interpolar dos imágenes distintas.
  float materialMix = clamp(max(lensMix, dropGlass * 0.96), 0.0, 1.0);
  float dimFactor = 1.0 - clamp(dim, 0.0, 1.0) * 0.16 * (1.0 - materialMix);
  half3 composed = color.rgb * dimFactor;
  return half4(composed, 1.0);
}
`;
