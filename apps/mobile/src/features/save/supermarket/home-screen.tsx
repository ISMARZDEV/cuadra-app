import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { AppBackground } from "@/components/ui/app-background";
import { useTabBarClearance } from "@/components/navigation/use-tab-bar-clearance";
import { PillButton } from "@/components/ui/pill-button";
import { t, useLang } from "@/i18n";
import { palette } from "@/theme";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { useCategories, useFeaturedProducts, useSubscribeAlert, useTodaysDeals } from "../api";
import { useCompareCount } from "../compare-basket";
import { ProductRail } from "./components/product-rail";
import { SupermarketHeader } from "./components/supermarket-header";
import { resolveHomeState } from "./home-state";

// La home de Supermarket: el header verde arqueado con su carrusel de categorías, y debajo los dos
// rails de producto — las ofertas del día y el catálogo general.
//
// Mismo fondo y misma geometría que el hub de Ahorra —gris plano en claro, gradiente en oscuro, y
// el blanco al pie que la barra de tabs flotante necesita— para que pasar de una a otra no se
// sienta como cambiar de app.
const BG_LIGHT = "#F4F4F4";
const GUTTER_X = 14;
const RAIL_GAP = 28;

/**
 * Dónde está comprando el usuario.
 *
 * Es una CONSTANTE y no un dato porque todavía no hay de dónde sacarlo: el mercado es `DO` y la app
 * no pide permiso de ubicación ni deja elegir tienda. Se deja escrito aquí, a la vista y con nombre
 * propio, en vez de incrustado en el JSX — el día que exista una fuente real, se cambia esta línea
 * y nada más. No se traduce: es un topónimo.
 */
const MARKET_LOCATION = "Santo Domingo, RD";

export function SupermarketHomeScreen() {
  useLang();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();

  const { width } = useWindowDimensions();


  const deals = useTodaysDeals();
  const featured = useFeaturedProducts();
  const categories = useCategories();
  const compareCount = useCompareCount();
  const subscribe = useSubscribeAlert();

  // Seguir el precio desde la tarjeta. El endpoint es el MISMO que usa la web, así que la alerta
  // aparece en el feed de la campana sin nada más que hacer.
  const follow = (productId: string) => subscribe.mutate({ productId });

  // La flecha del rail abre la rejilla ARRANCANDO en esta misma lista: pediste ver más de ESTO, así
  // que eso es lo primero que aparece. Las categorías quedan de pestañas al lado.
  const seeAll = (origin: "deals" | "featured") =>
    router.push(`/save/supermarket/browse?origin=${origin}` as Href);

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
          //
          // Y SIN `paddingTop`: el header es el primer elemento del contenido y su verde tiene que
          // llegar hasta el canto de la pantalla, por debajo del reloj del sistema. Es él quien
          // respeta el área segura por dentro, con sus controles.
          // SIN `gap` en el contenedor: el hueco de `RAIL_GAP` es la separación ENTRE RAILS, y
          // aplicado acá se lo llevaba también el header, que ya reserva por dentro el sitio de los
          // nombres de las categorías. El resultado era el primer título ~27pt más abajo que en el
          // diseño. Los rails se agrupan aparte, más abajo, y ahí sí se separan entre ellos.
          paddingBottom: tabBarClearance + RAIL_GAP,
        }}
      >
        <SupermarketHeader
          width={width}
          safeTop={insets.top}
          location={MARKET_LOCATION}
          locationLabel={t("save.supermarket.currentLocation")}
          categories={categories.data ?? []}
          basketCount={compareCount}
          searchPlaceholder={t("save.supermarket.searchPlaceholder")}
          backLabel={t("save.supermarket.back")}
          basketLabel={t("save.supermarket.compare")}
          alertsLabel={t("save.alerts.title")}
          onBack={() => router.back()}
          // Buscar y la canasta llevan al MISMO sitio: la rejilla es donde se busca de verdad y
          // donde vive la comparación. Dos puertas a la misma habitación, no dos habitaciones.
          onSearch={() => seeAll("featured")}
          onBasket={() => seeAll("featured")}
          onAlerts={() => router.push("/save/alerts" as Href)}
          onSelectCategory={(slug) =>
            router.push(`/save/supermarket/browse?category=${slug}` as Href)
          }
        />
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
          /* Los rails se separan ENTRE ELLOS acá dentro, no desde el contenedor: así el header
             queda pegado a su primer título, como en el diseño. */
          <View style={{ gap: RAIL_GAP }}>
            <ProductRail
              title={t("save.supermarket.deals.title")}
              subtitle={t("save.supermarket.deals.subtitle")}
              products={deals.data ?? []}
              gutter={GUTTER_X}
              onFollow={follow}
              onSeeAll={() => seeAll("deals")}
            />
            <ProductRail
              title={t("save.supermarket.products.title")}
              subtitle={t("save.supermarket.products.subtitle")}
              products={featured.data ?? []}
              gutter={GUTTER_X}
              onFollow={follow}
              onSeeAll={() => seeAll("featured")}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
