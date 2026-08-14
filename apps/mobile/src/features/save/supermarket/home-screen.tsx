import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { AppBackground } from "@/components/ui/app-background";
import { useTabBarClearance } from "@/components/navigation/use-tab-bar-clearance";
import { PillButton } from "@/components/ui/pill-button";
import { t, useLang } from "@/i18n";
import { palette } from "@/theme";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { useFeaturedProducts, useSubscribeAlert, useTodaysDeals } from "../api";
import { ProductRail } from "./components/product-rail";
import { resolveHomeState } from "./home-state";

// La home de Supermarket. Por ahora, los dos rails de producto: las ofertas del día y el catálogo
// general. El header curvo y los círculos de categoría del diseño llegan después.
//
// Mismo fondo y misma geometría que el hub de Ahorra —gris plano en claro, gradiente en oscuro, y
// el blanco al pie que la barra de tabs flotante necesita— para que pasar de una a otra no se
// sienta como cambiar de app.
const BG_LIGHT = "#F4F4F4";
const GUTTER_X = 14;
const RAIL_GAP = 28;

export function SupermarketHomeScreen() {
  useLang();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();

  const deals = useTodaysDeals();
  const featured = useFeaturedProducts();
  const subscribe = useSubscribeAlert();

  // Seguir el precio desde la tarjeta. El endpoint es el MISMO que usa la web, así que la alerta
  // aparece en el feed de la campana sin nada más que hacer.
  const follow = (productId: string) => subscribe.mutate({ productId });

  const state = resolveHomeState(
    { isLoading: deals.isLoading, isError: deals.isError, count: deals.data?.length ?? 0 },
    { isLoading: featured.isLoading, isError: featured.isError, count: featured.data?.length ?? 0 },
  );

  const retry = () => {
    void deals.refetch();
    void featured.refetch();
  };

  return (
    <View className="flex-1">
      {isDark ? (
        <AppBackground />
      ) : (
        <View pointerEvents="none" className="absolute inset-0" style={{ backgroundColor: BG_LIGHT }} />
      )}
      <ScrollView
        contentContainerStyle={{
          // SIN sangría lateral acá a propósito: cada rail la aplica por dentro para que su
          // carrusel pueda llegar al canto de la pantalla. Padeando el contenedor, el scroll
          // terminaba antes del borde y la última tarjeta se veía cortada contra un vacío.
          paddingTop: insets.top + 8,
          paddingBottom: tabBarClearance + RAIL_GAP,
          gap: RAIL_GAP,
        }}
      >
        {state === "loading" ? (
          <View className="pt-16">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : state === "error" ? (
          /* Un error de red tiene que DECIRSE. Sin esto la pantalla quedaba en blanco y no había
             forma de distinguir «se cayó la API» de «no hay productos» — pasó de verdad, y costó
             media hora de diagnóstico. El botón es lo que la convierte en salida y no en callejón. */
          <View className="items-center pt-16" style={{ paddingHorizontal: GUTTER_X * 2 }}>
            <Text
              className="text-center text-base text-text"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD }}
            >
              {t("save.supermarket.error.title")}
            </Text>
            <Text
              className="mt-1 text-center text-sm text-text/60"
              style={{ fontFamily: KANTUMRUY_MEDIUM }}
            >
              {t("save.supermarket.error.body")}
            </Text>
            <View className="mt-4">
              <PillButton label={t("save.supermarket.error.retry")} onPress={retry} />
            </View>
          </View>
        ) : state === "empty" ? (
          /* Respondieron bien y no hay nada. NO es un error, así que no lleva ni disculpa ni botón:
             reintentar no va a traer productos que no existen. */
          <View className="items-center pt-16" style={{ paddingHorizontal: GUTTER_X * 2 }}>
            <Text
              className="text-center text-sm text-text/60"
              style={{ fontFamily: KANTUMRUY_MEDIUM }}
            >
              {t("save.supermarket.empty")}
            </Text>
          </View>
        ) : (
          <>
            <ProductRail
              title={t("save.supermarket.deals.title")}
              subtitle={t("save.supermarket.deals.subtitle")}
              products={deals.data ?? []}
              gutter={GUTTER_X}
              onFollow={follow}
            />
            <ProductRail
              title={t("save.supermarket.products.title")}
              subtitle={t("save.supermarket.products.subtitle")}
              products={featured.data ?? []}
              gutter={GUTTER_X}
              onFollow={follow}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
