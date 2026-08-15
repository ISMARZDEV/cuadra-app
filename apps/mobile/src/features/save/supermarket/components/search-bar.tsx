import { ListFilter, Search } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";
import { useColorScheme } from "nativewind";

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
  const surface = isDark ? "#151515" : "#FFFFFF";
  const text = isDark ? "#FFFFFF" : GREEN;
  const muted = isDark ? "rgba(255,255,255,0.45)" : "#9AA8A6";

  return (
    <View className="flex-row items-center" style={{ gap: 10 }}>
      <View
        className="flex-1 flex-row items-center"
        style={{
          height: 52,
          borderRadius: 26,
          borderCurve: "continuous",
          backgroundColor: surface,
          paddingHorizontal: 18,
          gap: 10,
          // La misma sombra baja y difusa del card del hub: las superficies blancas de Save se
          // despegan del fondo igual en toda la app.
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        <Icon as={Search} size={20} color={muted} strokeWidth={2.2} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={muted}
          returnKeyType="search"
          // `accessibilityLabel` propio: el placeholder desaparece en cuanto hay texto, y con él se
          // iría el único nombre que un lector de pantalla podría anunciar.
          accessibilityLabel={placeholder}
          className="flex-1"
          style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 16, color: text }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filtersLabel}
        onPress={onFilters}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          borderCurve: "continuous",
          backgroundColor: surface,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        <Icon as={ListFilter} size={22} color={text} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
