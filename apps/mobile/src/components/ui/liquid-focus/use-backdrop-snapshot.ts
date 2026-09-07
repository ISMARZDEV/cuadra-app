import { useEffect, useState, type RefObject } from "react";
import type { View } from "react-native";
import { Skia, type SkImage } from "@shopify/react-native-skia";
import { captureRef } from "react-native-view-shot";

/**
 * LA FOTO DEL FONDO que la lente va a deformar.
 *
 * La lente no es un filtro en vivo: es un shader que MUESTREA una imagen. React Native no puede
 * darle a Skia el contenido de vistas nativas arbitrarias, así que hay que congelarlo primero
 * (`captureRef`) y convertirlo en `SkImage`.
 *
 * ⚠️⚠️ **JPG, y la FUENTE tiene que ser opaca — las dos cosas.** Primero puse JPG sobre una vista
 * transparente y salió el fondo NEGRO (un JPG no tiene alfa: aplana lo vacío a negro). Lo cambié a
 * PNG y aparecieron DOS defectos peores: la foto translúcida se componía sobre el contenido vivo
 * —todo duplicado, el «ghost» que el patrón advierte— y la aberración cromática muestreaba a través
 * del borde alfa dibujando un contorno de colores alrededor de todo.
 *
 * El formato nunca fue el problema. La exigencia del patrón es que la FUENTE sea opaca, y la
 * nuestra no lo era. Con el fondo de la app dentro de la vista capturada (ver `(tabs)/_layout`), el
 * JPG es correcto y los tres defectos desaparecen a la vez.
 *
 * ⚠️ **La imagen se conserva durante la RETIRADA.** Sólo se recaptura al volver a activarse. Si se
 * soltara al desactivar, la lente se quedaría sin qué muestrear justo durante los 350 ms en los que
 * todavía se está viendo, y el efecto desaparecería de golpe en vez de retirarse.
 *
 * ⚠️ **El contenido de debajo debe estar QUIETO mientras se enfoca.** Es un límite real del
 * mecanismo, no un descuido: si el fondo cambia (el chat recibiendo tokens), la foto congelada y la
 * vista viva divergen. Aquí se acepta porque el enfoque dura lo que dura un dedo apoyado.
 */
export function useBackdropSnapshot(
  active: boolean,
  viewRef: RefObject<View | null>,
): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);

  useEffect(() => {
    // Al desactivarse NO se limpia: ver arriba, la retirada todavía la necesita.
    if (!active) return;

    // ⚠️ PERO AL VOLVER A ACTIVARSE SÍ, Y ANTES DE NADA. La foto que sobrevivió a la retirada es de
    // la pulsación ANTERIOR, y para entonces el usuario puede estar en otra pantalla: durante el
    // fotograma que tarda la captura nueva, el shader estaría deformando la pantalla VIEJA. Se veía
    // como un parpadeo de contenido ajeno justo al pulsar.
    //
    // Soltarla aquí deja un fotograma sin imagen, no con la imagen equivocada — y ese fotograma es
    // invisible porque los relojes acaban de arrancar y todavía no hay nada que dibujar.
    setImage(null);

    let alive = true;

    // ⚠️⚠️ **`captureRef` puede LANZAR DE FORMA SÍNCRONA**, no sólo rechazar la promesa: si el
    // módulo nativo no está enlazado revienta con «NativeModules.RNViewShot is undefined» ANTES de
    // devolver nada, así que un `.catch()` no lo ve y el error sube hasta romper la pantalla.
    //
    // Y no es un caso raro: pasa SIEMPRE que se añade una dependencia nativa y todavía no se ha
    // recompilado el binario. Metro sirve el JS nuevo a una app vieja, el JS llama a algo que ese
    // binario no tiene, y lo que el usuario ve es una pantalla roja en vez de la función faltando.
    // La lente ya tiene su degradación documentada —`snapshot = null` es sólo-atenuado—, así que
    // aquí basta con no dejar escapar el fallo.
    // ⚠️ SE ESPERA UN FOTOGRAMA antes de disparar. El orbe de la barra se apaga en el MISMO estado
    // que activa esto, y `captureRef` llega a tiempo de fotografiarlo TODAVÍA VISIBLE: quedaba una
    // copia oscura del orbe DENTRO de la imagen, justo detrás del orbe nítido de encima. Un
    // `requestAnimationFrame` basta para que React haya pintado ya el apagado.
    const frame = requestAnimationFrame(() => {
      if (!alive) return;

      let capture: Promise<string>;
      try {
        capture = captureRef(viewRef, { format: "jpg", quality: 0.92, result: "base64" });
      } catch {
        return;
      }

      capture
        .then((base64) => {
          if (!alive) return;
          const data = Skia.Data.fromBase64(base64);
          const decoded = Skia.Image.MakeImageFromEncoded(data);
          // Si la decodificación falla nos quedamos sin lente, no con una imagen rota: el
          // componente degrada a sólo-atenuado, que es su fallback documentado.
          if (decoded) setImage(decoded);
        })
        .catch(() => {
          // Capturar puede fallar (vista desmontada, permiso, memoria). Un fallo aquí NO puede
          // tumbar la pantalla: la lente simplemente no aparece.
        });
    });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [active, viewRef]);

  return image;
}
