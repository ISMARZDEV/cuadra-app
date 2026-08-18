import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

// La lupa con destello es el SVG de diseño, no un icono de la librería aproximado: el destello de
// cuatro puntas es lo que anuncia que el buscador entiende lenguaje natural, y se perdía al
// sustituirlo por la lupa pelada de lucide.
//
// ⚠️ SUS TRAZOS SON `currentColor`, y hubo que cambiarlos: venían con el verde `#034842` incrustado
// porque el buscador vivía sobre una píldora blanca dentro del header. Ahora se apoya en la
// superficie de las tarjetas, que en oscuro es casi negra, y ahí ese verde desaparecía — medido
// sobre la captura, no supuesto. Con `currentColor` el color se lo da quien lo usa, vía `color`.
import SearchIcon from "@/assets/carrusel-save/search-icon.svg";
import { cardPalette } from "@/components/ui/basket-product-card";
import { KANTUMRUY_MEDIUM } from "@/theme/fonts";

// EL BUSCADOR EN REPOSO: la píldora del blanco, entre el arco y el primer rail.
//
// ⚠️ NO ES UN CAMPO, y esta vez no es una carencia: es el ANCLA de un campo que vive en otro sitio.
// Al tocarla se abre `search-overlay`, que sube hasta arriba con el teclado ya puesto. Escribir acá
// además de allá significaría dos campos que hay que mantener en sincronía, y el usuario nunca
// sabría en cuál está escribiendo.
//
// Por eso mide DÓNDE ESTÁ al tocarla (`onOpen`): la hoja arranca su viaje exactamente encima
// de esta píldora. Sin esa medida la copia aparecería en un sitio aproximado y el relevo entre las
// dos —que es lo que hace que se lea como UN objeto que sube— se vería como un parpadeo.

/** Alto de la píldora. El MISMO que el de la hoja abierta, o el viaje no se leería como un objeto. */
const SEARCH_H = 52;

interface HomeSearchBarProps {
  placeholder: string;
  /**
   * Abrir el buscador, con la `y` de esta píldora en coordenadas de VENTANA — o `undefined` si el
   * lado nativo no supo decirla.
   *
   * ⚠️ LA MEDIDA VIAJA CON EL TOQUE, y tiene que ser así. Antes se medía en `onLayout` y se
   * guardaba, pero **`onLayout` NO se dispara al hacer scroll**: bastaba desplazar la home y abrir
   * el buscador para que la copia viajara desde una posición VIEJA — aterrizaba de más y, al
   * desmontarse, la original aparecía en otro sitio. Se veía como un rebote y un choque.
   *
   * ⚠️ Y `undefined` NO ES UN PROBLEMA DEL LLAMADOR: quien recibe esto sabe DERIVAR la posición
   * (ver `search-anchor`). Aquí se dice la verdad —«no lo sé»— en vez de inventar una posición
   * plausible, que es lo que hacía el `lastY` que vivía aquí: guardaba la última medida buena y la
   * daba por válida más tarde, cuando ya podía estar rancia por el scroll. La geometría no
   * envejece; una medida guardada, sí.
   */
  onOpen: (y: number | undefined) => void;
  /**
   * Invisible mientras la hoja está abierta o cerrándose.
   *
   * ⚠️ ESTO NO ES UN DETALLE: sin ello se ven DOS buscadores a la vez —el de reposo y la copia que
   * viaja—, y el relevo que hace creíble el movimiento se convierte en un duplicado. Pasó, y era la
   * razón de que la animación se leyera mal.
   *
   * Se oculta por OPACIDAD y no desmontando: la píldora tiene que seguir ocupando su sitio para que
   * la home no dé un salto, y para que `measureInWindow` siga sabiendo dónde vuelve la copia.
   */
  hidden?: boolean;
}

export function HomeSearchBar({
  placeholder,
  onOpen,
  hidden = false,
}: HomeSearchBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // LA MISMA superficie que las tarjetas que tiene debajo, no un blanco propio: el buscador se
  // apoya en el mismo fondo que ellas, así que en oscuro tiene que oscurecerse igual o se queda
  // como un parche encendido sobre la pantalla.
  const surface = cardPalette(isDark ? "dark" : "light").shell;
  const muted = isDark ? "rgba(255,255,255,0.45)" : "#9AA8A6";
  // La lupa, en oscuro, va del LIMA de marca y no del verde profundo: el verde es el color de la
  // marca sobre BLANCO, y sobre la superficie oscura de las tarjetas se hunde hasta desaparecer.
  const iconColor = isDark ? "#C2FB7E" : "#034842";

  const ref = useRef<View>(null);

  return (
    <Pressable
      ref={ref}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      // SE MIDE EN EL TOQUE Y SÓLO EN EL TOQUE.
      //
      // Hubo también una medida en `onLayout` que se guardaba de respaldo, y se ha quitado: era
      // respaldo de nada. `measureInWindow` devuelve 0 en frío —también dentro de `onLayout`—, así
      // que en el primer toque no había ninguna medida buena guardada y la hoja se quedaba sin
      // posición. Y cuando sí la había, podía estar rancia: `onLayout` no se dispara al hacer
      // scroll. El respaldo bueno es la GEOMETRÍA, y vive en quien recibe esto (`search-anchor`).
      //
      // `measureInWindow` y no las coordenadas de `onLayout`: éstas son relativas al padre, y la
      // hoja se posiciona contra la VENTANA. Mezclarlas es el defecto clásico de este patrón.
      //
      // ⚠️ ABRIR NO PUEDE DEPENDER DE QUE LA MEDIDA FUNCIONE: si el buscador sólo se abriera dentro
      // del callback, un fallo dejaría el botón MUERTO — y una medida es una comodidad de la
      // animación, no la función del control.
      onPress={() => {
        const node = ref.current;
        if (typeof node?.measureInWindow !== "function") return onOpen(undefined);
        // Un 0 no es una posición: es el fallo de `measureInWindow` disfrazado de dato. Se dice
        // «no lo sé» y quien recibe deriva la posición, que en frío es la ÚNICA que hay.
        node.measureInWindow((_x, y) => onOpen(y > 0 ? y : undefined));
      }}
      style={{
        opacity: hidden ? 0 : 1,
        height: SEARCH_H,
        borderRadius: SEARCH_H / 2,
        borderCurve: "continuous",
        backgroundColor: surface,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        gap: 10,
        // La misma sombra baja y difusa del card del hub y del buscador de la rejilla: las
        // superficies de Save se despegan del fondo igual en toda la app.
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      <SearchIcon width={26} height={26} color={iconColor} />
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: KANTUMRUY_MEDIUM, fontSize: 16, color: muted }}
      >
        {placeholder}
      </Text>
    </Pressable>
  );
}
