import { describe, expect, test } from "vitest";

import { easingNameOf } from "@/test/reanimated-stub";

import {
  ENTRANCE_MS,
  ENTRANCE_TIMING,
  entranceKeyOf,
  lastStepEndsAt,
  STEP_COUNT,
  stepScheduleMs,
  STEPS,
  STEP,
  SPAN,
} from "./entrance";

describe("la cascada de entrada", () => {
  test("el último escalón termina DENTRO del reloj", () => {
    // Si la ventana del último se pasara de 1, ese bloque nunca llegaría a opacidad plena: se
    // quedaría a medio aparecer para siempre, y sólo se nota mirando muy fijo.
    expect(lastStepEndsAt(6)).toBeLessThanOrEqual(1);
  });

  test("los bloques que HAY caben en el reloj", () => {
    // No es holgura: con `STEP` 0.085 y `SPAN` 0.34 el noveno bloque terminaría en 1.02 y NUNCA
    // llegaría a opacidad plena — se quedaría a medio aparecer para siempre. Ocho es el techo con
    // estos números, así que este test es la barandilla de verdad: si alguien añade un bloque
    // más, aquí se entera, y no mirando muy fijo una pantalla en el dispositivo.
    expect(lastStepEndsAt(STEP_COUNT)).toBeLessThanOrEqual(1);
    expect(lastStepEndsAt(STEP_COUNT + 1)).toBeGreaterThan(1);
  });

  test("cada escalón dura lo MEDIDO en el clip, no lo que salga", () => {
    // La ventana w1 del clip de referencia da 134 ms de movimiento vivo por bloque. La duración
    // total se DERIVA de eso y del solape, en vez de escribirse a ojo.
    expect(Math.round(SPAN * ENTRANCE_MS)).toBeGreaterThanOrEqual(120);
    expect(Math.round(SPAN * ENTRANCE_MS)).toBeLessThanOrEqual(150);
  });

  test("los escalones SOLAPAN: es una ola, no una fila de turnos", () => {
    // Con STEP ≥ SPAN cada bloque esperaría a que el anterior terminase del todo y se leería como
    // seis animaciones seguidas en vez de como una sola cosa bajando por la pantalla.
    expect(STEP).toBeLessThan(SPAN);
  });

  // ── Lo que faltaba, y costó una fase entera ────────────────────────────────────────────────
  //
  // Los cuatro tests de arriba miden en PROGRESO, y en progreso todo cuadraba: 480 tests verdes
  // mientras en el dispositivo los seis bloques aparecían de golpe. El escalonado no lo vive el
  // usuario en progreso, lo vive en MILISEGUNDOS — y entre los dos hay una curva.

  test("el reloj de la cascada es LINEAL", () => {
    // ⭐ Esta es la regla, y ya estaba escrita en `search/search-overlay.tsx` (el primer consumidor
    // de `CascadeItem`): el escalonado vive en las VENTANAS de `cascade-item`, así que meter una
    // segunda curva en el reloj amontona los escalones del medio y separa los de los extremos.
    //
    // Medido en el simulador con la cascada corriendo sobre `Easing.bezier(0.2, 0, 0, 1)`: el
    // desfase entre el primer bloque y el último se quedaba en 69 ms —cuatro fotogramas— y la
    // cascada entera se acababa a los 143 ms de un reloj de 394 ms. Se leía como «todo a la vez»,
    // que es exactamente lo que la cascada existe para no ser.
    expect(easingNameOf(ENTRANCE_TIMING.easing)).toBe("linear");
  });

  test("el horario en MILISEGUNDOS respeta la medida del clip", () => {
    const plan = stepScheduleMs(6);

    // Cada bloque dura los 134 ms medidos en la ventana w1. En milisegundos de verdad.
    for (const { start, end } of plan) {
      expect(end - start).toBeGreaterThanOrEqual(128);
      expect(end - start).toBeLessThanOrEqual(140);
    }

    // Y el desfase entre bloques es PAREJO: una cascada con pasos desiguales se lee como un fallo,
    // no como una cadencia. Es la misma afirmación de forma que el resto del movimiento de la app:
    // se comprueba la RELACIÓN, no el milisegundo.
    const gaps = plan.slice(1).map((s, i) => s.start - plan[i].start);
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(gaps[0], 5);
    }

    // Un desfase por debajo de un par de fotogramas NO es una cascada: a 60 fps, 8 ms es medio
    // fotograma y los seis bloques caen en el mismo repintado.
    expect(gaps[0]).toBeGreaterThanOrEqual(25);
  });

  test("la cascada entera cabe en el reloj y lo APROVECHA", () => {
    const plan = stepScheduleMs(6);
    const last = plan[plan.length - 1].end;

    // Que quepa ya lo cubría `lastStepEndsAt`. Lo que faltaba es lo contrario: un reloj que
    // termina mucho después que el último bloque son milisegundos en los que no se mueve nada, y
    // ahí es donde se esconde una curva que se comió el escalonado.
    expect(last).toBeLessThanOrEqual(ENTRANCE_MS);
    expect(last).toBeGreaterThan(ENTRANCE_MS * 0.7);
  });
});

describe("cuándo se REPITE la entrada", () => {
  // Medido en el simulador: saltando de un producto a otro por los raíles de «similares» o «más de
  // la marca», la pantalla NO animaba nada. Entre 2,0 y 3,0 s de la grabación había 3 fotogramas
  // distintos, los tres dentro de 6 ms: el contenido cambiaba de golpe y se quedaba congelado.
  //
  // La causa es que `openProduct` hace `router.replace` sobre la MISMA ruta, así que el árbol se
  // conserva y sólo cambia el `slug` — el efecto que arranca el reloj nunca vuelve a dispararse.

  test("dos productos distintos son entradas distintas", () => {
    expect(entranceKeyOf("canon-a", "crema-coco")).not.toBe(entranceKeyOf("canon-b", "guandules"));
  });

  test("el MISMO producto no vuelve a entrar porque se refresquen sus datos", () => {
    // Un refetch de la comparación devuelve el mismo canónico. Repetir la cascada ahí sería una
    // pantalla que parpadea sola cada vez que se revalida una consulta.
    expect(entranceKeyOf("canon-a", "crema-coco")).toBe(entranceKeyOf("canon-a", "crema-coco"));
  });

  test("⭐ la identidad sale de los DATOS, no de la ruta", () => {
    // El `slug` de la ruta cambia ANTES de que llegue la comparación del producto nuevo. Si la
    // entrada colgara del slug, la cascada se ejecutaría sobre el contenido del producto ANTERIOR
    // —que es lo que sigue en pantalla— y el nuevo entraría después, de golpe y sin animar.
    expect(entranceKeyOf("canon-a", "crema-coco")).toBe(entranceKeyOf("canon-a", "guandules"));
  });

  test("sin canónico todavía se puede distinguir un producto de otro", () => {
    // El canónico puede faltar. Caer al slug es peor que tenerlo, pero infinitamente mejor que
    // devolver siempre lo mismo: eso apagaría la entrada para siempre y en silencio.
    expect(entranceKeyOf(null, "crema-coco")).not.toBe(entranceKeyOf(null, "guandules"));
    expect(entranceKeyOf(undefined, "crema-coco")).toBe(entranceKeyOf(null, "crema-coco"));
  });
});

describe("el reparto de puestos en la cascada", () => {
  test("cada bloque tiene un puesto PROPIO y consecutivo", () => {
    // Dos bloques con el mismo índice entran a la vez, y eso no se ve: se lee como que la cascada
    // «va rápida ahí». Un hueco en la numeración hace lo contrario, un silencio a media escalera.
    const puestos = Object.values(STEPS).sort((a, b) => a - b);
    expect(puestos).toEqual(puestos.map((_, i) => i));
  });

  test("el orden de los puestos es el orden de LECTURA, de arriba abajo", () => {
    // La cascada existe para que la pantalla se lea en el orden en que está escrita. Si el panel
    // de tiendas entrara antes que el precio, el movimiento contaría una historia distinta a la
    // que cuenta la maquetación.
    expect(STEPS.Photo).toBeLessThan(STEPS.Name);
    expect(STEPS.Name).toBeLessThan(STEPS.Price);
    expect(STEPS.Price).toBeLessThan(STEPS.Signals);
    expect(STEPS.Signals).toBeLessThan(STEPS.Stores);
    expect(STEPS.Stores).toBeLessThan(STEPS.Description);
    expect(STEPS.Description).toBeLessThan(STEPS.StorePanel);
    expect(STEPS.StorePanel).toBeLessThan(STEPS.History);
  });

  test("el último bloque llega a opacidad PLENA dentro del reloj", () => {
    const plan = stepScheduleMs(STEP_COUNT);
    expect(plan[plan.length - 1].end).toBeLessThanOrEqual(ENTRANCE_MS);
  });
});

describe("la entrada pertenece a la LLEGADA, no al producto", () => {
  // El usuario, sobre el dispositivo: «entrar por segunda vez a un MISMO producto sigue quedándose
  // estática; debe animarse siempre esa entrada». Con la identidad colgando sólo del producto, la
  // segunda llegada al mismo producto daba la MISMA `key` — y sin cambio de key no hay remonte, y
  // sin remonte el reloj se queda donde lo dejó la primera vez: en 1, con todo puesto.

  test("volver al MISMO producto es una entrada nueva", () => {
    expect(entranceKeyOf("canon-a", "crema-coco", 1)).not.toBe(
      entranceKeyOf("canon-a", "crema-coco", 2),
    );
  });

  test("dentro de una misma llegada, la key NO se mueve", () => {
    // Si cambiara entre renders de la misma visita, la cascada se reiniciaría sola a mitad — por
    // ejemplo al revalidarse cualquier consulta de la pantalla.
    expect(entranceKeyOf("canon-a", "crema-coco", 3)).toBe(entranceKeyOf("canon-a", "crema-coco", 3));
  });

  test("las dos causas son INDEPENDIENTES: cambiar de producto sin cambiar de visita también entra", () => {
    // Saltar por los raíles de «similares» no es una llegada nueva a la pantalla —nunca se sale de
    // ella— y aun así tiene que animar. Las dos señales suman; ninguna sustituye a la otra.
    expect(entranceKeyOf("canon-a", "crema-coco", 1)).not.toBe(
      entranceKeyOf("canon-b", "crema-coco", 1),
    );
  });

  test("la visita no puede colarse en la identidad del producto", () => {
    // Guarda contra la implementación perezosa `id + visit`: con ella, el producto «canon-1» en la
    // visita 2 y el «canon-2» en la visita 1 darían la misma key y una de las dos entradas se
    // perdería. Los dos trozos van separados por algo que no aparece en un UUID ni en un slug.
    expect(entranceKeyOf("canon-1", "s", 2)).not.toBe(entranceKeyOf("canon-2", "s", 1));
    expect(entranceKeyOf("canon-1", "s", 12)).not.toBe(entranceKeyOf("canon-11", "s", 2));
  });
});
