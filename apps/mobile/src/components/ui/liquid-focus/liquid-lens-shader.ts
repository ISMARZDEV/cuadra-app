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
uniform float ambientDisplacement;
uniform float blurRadius;
uniform float ambientBlur;
uniform float veil;
uniform float ambientVeil;
uniform float veilFull;
uniform float3 veilColor;
uniform float edgeTilt;
uniform float ripple;
uniform float domePulse;
uniform float gather;
uniform float wavePhase;
uniform float release;
uniform float2 dropOrigin;
uniform float dropRadius;
uniform float dropWidth;
uniform float dim;
uniform float seal;

half4 main(float2 xy) {
  float nx = (xy.x / size.x - 0.5) * 2.0;
  // El casquete respira como una membrana circular, no como una línea trasladándose. Al contraerse
  // reduce su radio horizontal y profundiza el centro; al abrirse relaja ambos a la vez.
  float domeSpan = clamp((1.0 + domePulse * 0.14) * (1.0 - gather * 0.16), 0.72, 1.16);
  float domeX = clamp(nx / domeSpan, -1.0, 1.0);
  float circularArch = sqrt(max(0.0, 1.0 - domeX * domeX));
  float softArch = max(0.0, 1.0 - domeX * domeX);
  float arch = mix(softArch, circularArch, 0.76);
  float domeDepth = clamp(
    (1.0 + domePulse * 0.42) * (1.0 + gather * 0.32),
    0.62,
    1.82
  );

  // La respiración cambia la FORMA: arco, ladeo y una onda secundaria. \`arch\` apaga esa onda en
  // los costados para no abrir una discontinuidad contra el borde de pantalla.
  // La deformación principal no vive clavada en un costado. Dos lóbulos de anchura cambiante
  // recorren el canto con fases lentas independientes; unas veces tiran desde una esquina, otras
  // desde el centro o el lado opuesto. Es movimiento continuo pseudoaleatorio, no ruido por frame.
  float roamPhase = wavePhase * 0.29 + sin(wavePhase * 0.071) * 0.84;
  float roamX = clamp(
    sin(roamPhase) * 0.66 + sin(wavePhase * 0.61 + 1.3) * 0.18,
    -0.82,
    0.82
  );
  float counterX = clamp(
    -roamX * 0.72 + sin(wavePhase * 0.43 - 0.8) * 0.22,
    -0.84,
    0.84
  );
  float roamWidth = 0.25 + 0.10 * (0.5 + 0.5 * sin(wavePhase * 0.23 + 0.4));
  float counterWidth = 0.22 + 0.08 * (0.5 + 0.5 * sin(wavePhase * 0.17 - 1.0));
  float roamLobe = exp(-pow((nx - roamX) / roamWidth, 2.0));
  float counterLobe = exp(-pow((nx - counterX) / counterWidth, 2.0));
  float roamPolarity = sin(wavePhase * 0.53 + sin(wavePhase * 0.113) * 0.65);
  float counterPolarity = sin(wavePhase * 0.37 + 1.7 + sin(wavePhase * 0.089) * 0.52);
  float movingFold = 0.24 * sin(nx * 3.4 + wavePhase * 0.47)
    + 0.76 * roamLobe * roamPolarity
    + 0.46 * counterLobe * counterPolarity;
  float edge = boundary - bow * domeDepth * arch
    + edgeTilt * nx
    + ripple * movingFold * arch;
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

  // ── PLANO SUPERIOR ──
  // La zona por encima del menisco no está completamente «fuera»: en Monogram conserva una bruma
  // gaussiana tenue, como si el contenido estuviera visto desde otro plano del mismo líquido. No
  // usamos ruido por fotograma —parpadearía— sino tres armónicos espaciales de baja frecuencia.
  // Sus velocidades no son múltiplos entre sí y cada una lleva una deriva lenta: no hay un ciclo
  // corto reconocible ni un fotograma donde el movimiento se congele para volver a comenzar.
  float2 plane = xy / size;
  float phaseDriftA = sin(wavePhase * 0.13 + 0.7) * 0.36;
  float phaseDriftB = sin(wavePhase * 0.19 - 1.1) * 0.42;
  float phaseDriftC = sin(wavePhase * 0.11 + 2.0) * 0.51;
  float driftA = sin(
    (plane.x * 2.20 + plane.y * 1.35) * 6.2831853 + wavePhase * 0.61 + phaseDriftA
  );
  float driftB = sin(
    (plane.x * -1.15 + plane.y * 2.55) * 6.2831853 - wavePhase * 0.37 + phaseDriftB
  );
  float driftC = sin(
    (plane.x * 3.70 - plane.y * 1.10) * 6.2831853 + wavePhase * 0.83 + phaseDriftC
  );
  float ambientMotion = clamp(0.66 + driftA * 0.16 + driftB * 0.11 + driftC * 0.07, 0.34, 1.0);
  float aboveMeniscus = 1.0 - depth;
  float materialStrength = smoothstep(0.015, 0.18, strength);
  float ambientField = ambientBlur * ambientMotion * aboveMeniscus
    * materialStrength * lensPresence;

  // ── DESPLAZAMIENTO ──
  // ⭐ La coordenada vertical sólo AVANZA con depth. La versión anterior añadía una campana
  // positiva basada en rim; al subir y luego bajar esa campana, uv.y podía devolverse y muestrear
  // la misma línea dos veces —un reflejo literal. Esta rampa conserva la curva y el estiramiento,
  // pero es monótona: ningún píxel del fondo se repite.
  // Durante TODO el ciclo NO hay refracción óptica: nada se desplaza lateralmente, separa color ni
  // empuja radialmente una segunda imagen. La deformación es una sola rampa vertical MONÓTONA. Su
  // amplitud cambia a lo ancho con una onda positiva, así el contenido fluye en vez de trasladarse
  // como un bloque, pero ninguna coordenada retrocede ni repite una línea del fondo.
  // La densidad del pliegue sigue a los mismos lóbulos viajeros. El suelo positivo conserva el
  // mapa vertical monótono (sin reflejo), mientras el máximo migra entre lados y esquinas.
  float roamingDensity = roamLobe * (0.5 + 0.5 * roamPolarity)
    + counterLobe * (0.5 + 0.5 * counterPolarity);
  float verticalFlow = arch * clamp(
    0.72 + 0.12 * sin(nx * 4.6 + wavePhase * 0.91) + 0.30 * roamingDensity,
    0.62,
    1.18
  );
  // Arriba sí hay DEFORMACIÓN, pero no refracción: una única coordenada avanza sólo en Y y su
  // amplitud es ~12% de la masa inferior. La combinación no periódica en el espacio evita un
  // vaivén mecánico; las frecuencias temporales enteras mantienen el cierre perfecto del ciclo.
  // Con esta amplitud y estas longitudes de onda la derivada vertical permanece positiva: no se
  // pliega el mapa, no se repite una línea y por tanto no reaparece el reflejo.
  float ambientWarpWave = driftA * 0.56 + driftB * 0.29 + driftC * 0.15;
  float ambientFlow = displacement * ambientDisplacement * ambientWarpWave
    * aboveMeniscus * materialStrength * lensPresence;
  // Una curva monótona menor que 1 adelanta el pliegue dentro del feather: el canto dobla con
  // fuerza y luego continúa hacia el fondo sin la campana que antes hacía volver la coordenada y
  // creaba un reflejo. Es glass-liquid en el borde, no una segunda imagen.
  float liquidDepth = pow(max(depth, 0.0), 0.68);
  // La liberación añade un pliegue VERTICAL ancho y de poca amplitud. Es una sola muestra que
  // nunca se desplaza de lado ni se mezcla con el original: se siente acuoso sin volver a crear la
  // refracción/fantasma que se eliminó. La amplitud es pequeña frente al ancho del anillo, por lo
  // que la coordenada sigue avanzando y no repite líneas del fondo.
  float releaseFlow = dropGlass * dropWidth * 0.18 * (0.76 + 0.24 * arch);
  float2 uv = xy
    + float2(
      0.0,
      displacement * verticalFlow * liquidDepth * 0.68 * lensPresence + ambientFlow + releaseFlow
    );

  // Los dos anillos de liberación son VIDRIO: viajan como blur/densidad, no como refracción. Esto
  // hace visible la gota incluso sobre zonas lisas y evita el salto tardío del borrado anterior.
  float blurField = max(max(liquidDepth * lensPresence, dropGlass), ambientField);
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
  float lensMix = materialStrength * lensPresence
    * smoothstep(edge - feather * 1.18, edge + feather * 0.62, xy.y);
  float releaseVeil = veil * dropGlass * 0.42;
  // El velo ambiente hace visible la respiración incluso sobre superficies lisas. Su máximo es
  // menor de una quinta parte del material en el borde; sólo cambia densidad/luminancia y por eso
  // no puede producir la refracción ni el reflejo doble eliminados arriba.
  float ambientGlass = ambientVeil * ambientMotion * aboveMeniscus
    * materialStrength * lensPresence;
  // ⭐ EL SELLADO. Mientras se dicta, el velo es una RAMPA atada al menisco —blanco pleno abajo,
  // nada arriba— y por eso la cabecera se lee limpia. Pero una rampa NO PUEDE tapar una navegación
  // por debajo: al saltar al chat se vería la pantalla nueva asomando por arriba.
  //
  // ⚠️ Se resuelve con una MEZCLA hacia el velo pleno, sin tocar veilRamp ni lensMix: esa
  // matemática está calibrada contra la referencia y cualquier retoque ahí cambiaría cómo se lee el
  // menisco durante el dictado, que es lo que más se mira. Sellar es otro trabajo del mismo velo.
  float vA = clamp(
    mix(veil * veilRamp * lensMix + releaseVeil + ambientGlass, veil, seal),
    0.0,
    1.0
  );
  color.rgb = color.rgb * (1.0 - vA) + half3(veilColor) * vA;

  // El pequeño glitch cromático de Monogram vive ÚNICAMENTE en el menisco. No vuelve a muestrear
  // la imagen ni separa geometría RGB; modula los canales de la única muestra ya deformada. Dos
  // armónicos evitan que el patrón quede congelado mientras la cúpula respira.
  float rimCoordinate = (xy.y - edge) / max(feather * 0.72, 1.0);
  float rimBand = exp(-rimCoordinate * rimCoordinate * 2.2)
    * arch * materialStrength * lensPresence;
  float glitchWave = sin(nx * 16.0 + wavePhase * 1.7)
    + 0.45 * sin(nx * 29.0 - wavePhase * 2.3);
  float chroma = rimBand * glitchWave * 0.026;
  color.rgb = clamp(
    color.rgb + half3(chroma * 0.72, -abs(chroma) * 0.16, -chroma * 0.82),
    half3(0.0),
    half3(1.0)
  );

  // En el plano alto el mismo gesto cromático existe, pero al 12–15% del menisco. No desplaza
  // canales ni vuelve a evaluar la captura: sólo tiñe muy levemente la muestra única ya ondulada,
  // suficiente para revelar el movimiento sobre texto y botones sin convertirlo en un glitch UI.
  float ambientGlitchWave = sin(
    (plane.x * 7.3 + plane.y * 5.1) * 6.2831853 + wavePhase * 0.53 + phaseDriftB
  );
  float ambientChroma = ambientGlitchWave * aboveMeniscus * materialStrength
    * lensPresence * ambientMotion * 0.0030;
  color.rgb = clamp(
    color.rgb + half3(ambientChroma * 0.62, -abs(ambientChroma) * 0.10, -ambientChroma * 0.70),
    half3(0.0),
    half3(1.0)
  );

  // CROMA IRIDISCENTE, no separación RGB. Una paleta de película fina gira con la misma deriva
  // que deforma el contenido: cian → violeta → ámbar → verde. El menisco recibe el metal líquido
  // evidente; arriba apenas un eco que sólo aparece donde la ondulación tiene amplitud.
  float chromePhase = plane.x * 9.4 + plane.y * 7.1
    + wavePhase * 0.43 + ambientWarpWave * 1.65;
  float3 chrome = 0.5 + 0.5 * cos(
    chromePhase + float3(0.0, 2.0943951, 4.1887902)
  );
  float ambientChrome = abs(ambientWarpWave) * ambientField * 0.045;
  float rimChrome = rimBand * (0.072 + 0.022 * abs(glitchWave));
  float chromeAmount = clamp(ambientChrome + rimChrome, 0.0, 0.11);
  // Centrar la paleta en 0.5 conserva la luminancia media: aporta croma sin pintar una lámina de
  // color encima ni aclarar el tema oscuro de forma acumulativa.
  color.rgb = clamp(
    color.rgb + half3((chrome - float3(0.5)) * chromeAmount),
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
