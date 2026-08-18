import { Clock, Search, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";
import { KANTUMRUY_MEDIUM, KANTUMRUY_REGULAR } from "@/theme/fonts";

import { ICON_SIZE, ROW_HEIGHT } from "./search-skeleton-layout";

// UNA fila del buscador: disco con icono · título · bajada · «x».
//
// La misma fila sirve para el historial y para las sugerencias, y eso es deliberado: son la misma
// COSA para el usuario —algo que puede tocar para buscar— y darles dos formas distintas haría que
// la lista pareciera dos listas cuando pasa de una a otra al teclear. Lo único que cambia es el
// icono (reloj = ya lo buscaste; lupa = te lo proponemos) y si lleva «x» o no.

interface SearchRowProps {
  title: string;
  /** La línea de abajo. Ausente en una búsqueda del historial: un texto tecleado no tiene marca. */
  subtitle?: string;
  /** `history` pinta el reloj; `suggestion`, la lupa. */
  kind: "history" | "suggestion";
  onPress: () => void;
  /** Ausente = fila sin «x». Sólo el historial se puede quitar; una sugerencia no es tuya. */
  onRemove?: () => void;
  removeLabel: string;
}

function SearchRowBase({
  title,
  subtitle,
  kind,
  onPress,
  onRemove,
  removeLabel,
}: SearchRowProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const text = isDark ? "#FFFFFF" : "#0B1F1E";
  const muted = isDark ? "rgba(255,255,255,0.5)" : "#7A8A88";
  // El disco NO es del color de la tarjeta: sobre el fondo de la hoja se perdería. Es un apoyo
  // apenas más claro (o más oscuro) que el fondo, justo lo necesario para que el icono se pose.
  const disc = isDark ? "rgba(255,255,255,0.08)" : "rgba(3,72,66,0.06)";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      // La fila entera es el objetivo, no sólo el texto: un objetivo de 64pt de alto se acierta sin
      // mirar, que es como se usa un historial.
      style={{ height: ROW_HEIGHT, flexDirection: "row", alignItems: "center" }}
    >
      <View
        style={{
          width: ICON_SIZE,
          height: ICON_SIZE,
          borderRadius: ICON_SIZE / 2,
          borderCurve: "continuous",
          backgroundColor: disc,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon as={kind === "history" ? Clock : Search} size={20} color={muted} strokeWidth={2} />
      </View>

      {/* `flex: 1` + `minWidth: 0` — el segundo hace el trabajo: sin él, un nombre largo EMPUJA la
          «x» fuera de la pantalla en vez de recortarse. Es la trampa clásica de flex. */}
      <View style={{ flex: 1, minWidth: 0, marginLeft: 14, marginRight: 10 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 15, color: text }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontFamily: KANTUMRUY_REGULAR,
              fontSize: 13,
              color: muted,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          onPress={onRemove}
          // Área de toque propia y generosa: la «x» vive pegada al canto y a la fila entera, así
          // que sin este aire quitar una búsqueda acaba abriéndola.
          hitSlop={12}
          style={{ padding: 6 }}
        >
          <Icon as={X} size={20} color={muted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * MEMOIZADA, y no por costumbre: el campo de texto vive en el mismo componente que la lista, así
 * que CADA TECLA re-renderiza el árbol entero. Sin esto, escribir «leche» redibuja las doce filas
 * cinco veces —sesenta renders de fila por palabra— en el hilo de JS, que es justo el que tiene que
 * estar libre para que la animación y el teclado vayan finos.
 *
 * Funciona porque las props son primitivas y los callbacks vienen de una lista memoizada arriba
 * (ver `search-overlay`); si alguien pasa un callback creado en el render, la memo deja de servir.
 */
export const SearchRow = memo(SearchRowBase);
