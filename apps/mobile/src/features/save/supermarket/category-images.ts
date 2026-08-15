import type { ImageSourcePropType } from "react-native";

// La ilustración de cada categoría del carrusel del header.
//
// EL MAPA VA POR SLUG, NO POR NOMBRE. El nombre viene del servidor, lleva acentos y ampersands, y
// cambia con el idioma: casarlo contra un nombre de archivo es una bomba de relojería que estalla el
// día que la app se abra en inglés. El slug es el identificador estable de la categoría.
//
// Y es un mapa EXPLÍCITO, no un `require()` armado con plantillas: Metro empaqueta los assets
// resolviendo las rutas en tiempo de compilación, así que un `require(\`...${slug}.png\`)` no
// encuentra nada. Escritas a mano, además, una ruta mal puesta revienta al empaquetar —fuerte y
// temprano— en vez de dejar un hueco en la pantalla.
//
// ⚠️ LOS ARCHIVOS SE RENOMBRARON AL SLUG, y hubo que hacerlo: como salieron de diseño llevaban
// acentos, ampersands y hasta espacios DOBLES, y Metro no los resuelve. `Alcohol.png` entraba y
// `Bebés.png` reventaba el empaquetado — macOS guarda la `é` DESCOMPUESTA (NFD, `e` + tilde
// suelta) y el mismo carácter escrito en el editor va compuesto (NFC): son dos cadenas distintas
// para el resolvedor, aunque en pantalla se vean iguales. Con el nombre en ASCII el problema no
// puede volver. Al re-exportar desde Figma hay que renombrar al slug.
const IMAGES: Record<string, ImageSourcePropType> = {
  alcohol: require("@/assets/categories-supermarket/alcohol.png"),
  bebes: require("@/assets/categories-supermarket/bebes.png"),
  bebidas: require("@/assets/categories-supermarket/bebidas.png"),
  "carnes-pescados": require("@/assets/categories-supermarket/carnes-pescados.png"),
  "cuidado-del-hogar": require("@/assets/categories-supermarket/cuidado-del-hogar.png"),
  "cuidado-personal": require("@/assets/categories-supermarket/cuidado-personal.png"),
  "despensa-abarrotes": require("@/assets/categories-supermarket/despensa-abarrotes.png"),
  "embutidos-delicatessen": require("@/assets/categories-supermarket/embutidos-delicatessen.png"),
  "escolares-oficina": require("@/assets/categories-supermarket/escolares-oficina.png"),
  "frutas-verduras": require("@/assets/categories-supermarket/frutas-verduras.png"),
  "panaderia-tortilleria": require("@/assets/categories-supermarket/panaderia-tortilleria.png"),
  "salud-farmacia": require("@/assets/categories-supermarket/salud-farmacia.png"),
  "snacks-dulces": require("@/assets/categories-supermarket/snacks-dulces.png"),
};

/**
 * Los pasteles del respaldo, MUESTREADOS de las ilustraciones reales (no inventados): así el círculo
 * de una categoría sin foto pertenece a la misma familia que sus vecinas en vez de cantar.
 */
const FALLBACK_TINTS = ["#E9FFD9", "#FFD2D2", "#FEDFB5", "#CAEFFA", "#FFE2F8", "#FFC8C8"] as const;

/** La ilustración de una categoría, o `null` si todavía no la exportaron. */
export function categoryImage(slug: string): ImageSourcePropType | null {
  return IMAGES[slug] ?? null;
}

/**
 * El pastel del círculo de respaldo. Se elige por el SLUG y no al azar ni por el índice: tiene que
 * salir el mismo color en cada render y en cada página del carrusel, o la categoría cambiaría de
 * color al deslizar y parecería otra.
 */
export function fallbackTint(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) % 100_000;
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length];
}

/**
 * La letra del círculo de respaldo. `Array.from` y no `slug[0]`: cortar por unidad de código parte
 * en dos cualquier carácter fuera del plano básico y dibuja media letra.
 */
export function fallbackInitial(name: string): string {
  return (Array.from(name.trim())[0] ?? "?").toUpperCase();
}
