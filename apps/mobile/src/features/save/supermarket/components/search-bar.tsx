import { ListFilter } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";
import { useColorScheme } from "nativewind";

// LA MISMA lupa con destello que la home, no la de la librería. El destello de cuatro puntas es lo
// que anuncia que el buscador entiende lenguaje natural, y con la lupa pelada de lucide se perdía:
// eran dos buscadores distintos prometiendo cosas distintas. Sus trazos son `currentColor`, así que
// el color se lo da quien lo usa.
import SearchIcon from "@/assets/carrusel-save/search-icon.svg";
import { GlassField } from "@/components/ui/glass-field";
import { Icon } from "@/components/ui/icon";
import { KANTUMRUY_MEDIUM } from "@/theme/fonts";

// Buscador de la rejilla + el botón de filtros a su derecha.
//
// ⚠️ LIMITACIÓN CONOCIDA: el campo filtra lo que YA ESTÁ DESCARGADO, no consulta al servidor.
//
// Con la lista entera en memoria eso era suficiente. Desde que la rejilla PAGINA ya no lo es: filtra
// sólo el bloque cargado, así que en un catálogo grande MIENTE — y con pocos resultados no queda
// scroll, luego `onEndReached` no dispara y no hay forma de descubrir el resto.
//
// La solución correcta es buscar en el servidor, pero `/save/search` devuelve `ProductSearchDto`
// (id/slug/nombre/marca) SIN precio ni imagen: no alcanza para pintar una tarjeta. Y no se puede
// reformar ese endpoint porque lo comparten la web y el typeahead del chat —que justamente NO
// quiere precios—. Hace falta uno NUEVO que cruce la búsqueda con la oferta vigente del mercado.
const GREEN = "#034842";
/** Alto de la píldora, y su radio es la mitad: una cápsula. El mismo par en los tres buscadores. */
const FIELD_H = 52;

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  filtersLabel: string;
  onFilters?: () => void;
}

export function SearchBar({
  value,
  onChange,
  placeholder,
  filtersLabel,
  onFilters,
}: SearchBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // Los colores del contenido salen del compositor del chat, no de la superficie blanca de antes:
  // sobre vidrio, un gris al 45% se hunde. El del marcador de posición es más apagado que el del
  // texto escrito, que es lo que distingue «lo que puedes escribir» de «lo que escribiste».
  const text = isDark ? "#FFFFFF" : GREEN;
  const muted = isDark ? "#6A6A6A" : "#BEC2C0";
  // La lupa va del LIMA de marca en oscuro y del verde profundo en claro — el verde es el color de
  // la marca SOBRE BLANCO y sobre una superficie oscura se hunde hasta desaparecer. Mismo par que
  // en la home, porque es el mismo icono haciendo el mismo trabajo.
  const iconColor = isDark ? "#C2FB7E" : GREEN;
  const cursor = isDark ? "#DEFFB7" : GREEN;

  return (
    <View className="flex-row items-center" style={{ gap: 10 }}>
      <GlassField
        radius={FIELD_H / 2}
        style={{ flex: 1 }}
        contentStyle={{
          height: FIELD_H,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 18,
          gap: 10,
        }}
      >
        <SearchIcon width={26} height={26} color={iconColor} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={muted}
          returnKeyType="search"
          cursorColor={cursor}
          selectionColor={cursor}
          // `accessibilityLabel` propio: el placeholder desaparece en cuanto hay texto, y con él se
          // iría el único nombre que un lector de pantalla podría anunciar.
          accessibilityLabel={placeholder}
          className="flex-1"
          // `alignSelf: "stretch"` para que el campo ocupe los 52pt de alto: centrado, sólo era
          // tan alto como su texto y el dedo no lo encontraba cerca de los cantos de la píldora.
          style={{ alignSelf: "stretch", fontFamily: KANTUMRUY_MEDIUM, fontSize: 16, color: text }}
        />
      </GlassField>

      {/* El botón de filtros comparte el MISMO vidrio que el campo — son la misma barra partida en
          dos, y darle otra superficie los convertiría en dos cosas que se parecen. El toque se
          recibe DENTRO del cristal, para que la deformación del material sea la que responde. */}
      <GlassField radius={FIELD_H / 2}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtersLabel}
          onPress={onFilters}
          style={{
            width: FIELD_H,
            height: FIELD_H,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon as={ListFilter} size={22} color={text} strokeWidth={2.2} />
        </Pressable>
      </GlassField>
    </View>
  );
}
