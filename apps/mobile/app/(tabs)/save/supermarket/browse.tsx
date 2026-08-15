// Route = thin re-export of the feature screen (cuadra-mobile skill §1).
//
// `origin` llega por query param y decide con qué lista arranca la pantalla: es de dónde venía el
// usuario al tocar la flecha. Cualquier valor que no sea `deals` cae en `featured`, que es el
// catálogo general — un deep link con basura enseña productos, no un error.
import { useLocalSearchParams } from "expo-router";

import { SupermarketBrowseScreen } from "@/features/save/supermarket/browse-screen";

export default function SupermarketBrowseRoute() {
  const { origin } = useLocalSearchParams<{ origin?: string }>();
  return <SupermarketBrowseScreen origin={origin === "deals" ? "deals" : "featured"} />;
}
