import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  withDelay,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { SupermarketBackground } from "./components/supermarket-background";
import { useTabBarClearance } from "@/components/navigation/use-tab-bar-clearance";
import { PillButton } from "@/components/ui/pill-button";
import { t, useLang } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { useCategories, useFeaturedProducts, useSubscribeAlert, useTodaysDeals } from "../api";
import { useCompareCount } from "../compare-basket";
import { useRecentSearchesStore } from "@/store/recent-searches-store";

import { browseSearchHref } from "./home-search";
import { resolveSearchAnchor } from "./search-anchor";
import { HomeSearchBar } from "./components/home-search-bar";
import {
  HEADER_AWAY_AT,
  HEADER_AWAY_MS,
  HEADER_BACK_AT,
  HEADER_BACK_MS,
} from "./search-choreography";
import { SearchOverlay } from "./search/search-overlay";
import type { ProductCardDto } from "@cuadra/api-client";

import { nextHiddenState } from "@/components/navigation/hide-on-scroll";
import { useIdleHideHere } from "@/components/navigation/use-idle-hide-here";
import { useNavHideStore } from "@/store/nav-hide-store";

import { ProductRail } from "./components/product-rail";
import { RailsSkeleton } from "./components/supermarket-skeletons";
import { SupermarketHeader, headerBlockHeight } from "./components/supermarket-header";
import { resolveHomeState } from "./home-state";

// La home de Supermarket: el header verde arqueado con su carrusel de categorías, y debajo los dos
// rails de producto — las ofertas del día y el catálogo general.
//
// Mismo fondo y misma geometría que el hub de Ahorra —gris plano en claro, gradiente en oscuro, y
// el blanco al pie que la barra de tabs flotante necesita— para que pasar de una a otra no se
// sienta como cambiar de app.
const GUTTER_X = 14;
const RAIL_GAP = 28;
/** Aire entre el buscador y el título del primer rail. El header ya reserva el suyo por arriba
 *  (`ARC_BOTTOM_PAD`), así que aquí sólo hace falta separarlo de lo que viene debajo. */
const SEARCH_GAP = 22;

/** «Emphasized accelerate» de M3: al irse no hay nada que seguir con la vista, así que acelera. */
const HEADER_OUT = Easing.bezier(0.3, 0, 0.8, 0.15);
/** «Emphasized»: vuelve suave, coge velocidad y frena al posarse — la misma que el descenso. */
const HEADER_IN = Easing.bezier(0.2, 0, 0, 1);


export function SupermarketHomeScreen() {
  useLang();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();

  const { width } = useWindowDimensions();

  // El buscador abierto. `searchY` es dónde está la píldora en reposo: de ahí arranca su viaje
  // hacia arriba, así que la hoja parece la MISMA píldora subiendo y no otra que aparece.
  const [searchOpen, setSearchOpen] = useState(false);
  // `searchActive` dura MÁS que `searchOpen`: se apaga cuando la hoja termina de bajar, no cuando
  // se pulsa cerrar. Es lo que esconde la píldora de reposo durante TODO el viaje —ida y vuelta—,
  // para que nunca se vean las dos a la vez.
  const [searchActive, setSearchActive] = useState(false);
  const [searchY, setSearchY] = useState(0);
  /**
   * Cuánto se ha desplazado la home. Es lo ÚNICO que la geometría del ancla no puede deducir sola.
   *
   * En un `ref` y no en estado: se escribe 60 veces por segundo y ninguna de ellas tiene que
   * repintar nada. Sólo se LEE en el toque, que es cuando importa.
   */
  const scrollY = useRef(0);
  /**
   * Cada vuelta del buscador incrementa este número, y con él la pantalla REPITE su entrada.
   *
   * Volver de una hoja a pantalla completa es, para el ojo, LLEGAR a un sitio — aunque técnicamente
   * la home nunca se fue. Sin esto, la pantalla reaparecía de golpe y se leía como un corte: se veía
   * que había estado ahí todo el rato, escondida. Repitiendo la entrada, volver se siente como
   * volver.
   */
  const [entranceKey, setEntranceKey] = useState(0);

  // EL HEADER SE RETIRA HACIA ARRIBA mientras se busca — el verde arqueado y la ruleta con él.
  //
  // No es adorno: es lo que convierte «apareció una hoja encima» en «la pantalla se reorganizó para
  // dejarle sitio al buscador». El header es lo más pesado que hay arriba, y verlo APARTARSE
  // explica por qué el buscador puede subir hasta ahí. Tapado por un telón, ese sitio parecería
  // ocupado todavía.
  const headerAway = useSharedValue(0);
  useEffect(() => {
    headerAway.value = withDelay(
      // AL IRSE espera a que las categorías se hayan retirado (ver `POP_OUT_*` en `category-arc`):
      // el header se VACÍA y sólo entonces se retira. AL VOLVER espera a que la barra empiece a
      // bajar, y entonces baja CON ella — mismo arranque, misma duración, mismo aterrizaje.
      searchOpen ? HEADER_AWAY_AT : HEADER_BACK_AT,
      withTiming(searchOpen ? 1 : 0, {
      // Las MISMAS curvas de la hoja: sale con la del que se va y vuelve con la simétrica, así el
      // header y el buscador se mueven con una sola voz en vez de parecer dos animaciones sueltas.
      duration: searchOpen ? HEADER_AWAY_MS : HEADER_BACK_MS,
      easing: searchOpen ? HEADER_OUT : HEADER_IN,
      }),
    );
    // ⚠️ `searchOpen` Y NO `searchActive`, y ésta es LA LÍNEA DEL ARREGLO.
    //
    // Las dos banderas se encienden juntas al abrir, pero se apagan en momentos MUY distintos:
    // `searchOpen` en el toque de la X, `searchActive` cuando la hoja avisa de que la barra ya
    // aterrizó (`onClosed`, 760ms después). Colgado de la segunda, el header no empezaba a volver
    // hasta que todo lo demás había terminado: 760ms de pantalla SIN header, y sólo entonces
    // bajaba el verde. La duración era la correcta desde el principio; la SEÑAL no.
    //
    // `searchActive` sigue siendo la correcta para lo suyo —esconder la píldora de reposo—, porque
    // esa sí tiene que durar todo el viaje de ida y vuelta. Son dos preguntas distintas.
  }, [searchOpen, headerAway]);

  // ⚠️ LA ALTURA SE CALCULA AQUÍ, EN JS, y no dentro del worklet de abajo.
  //
  // `useAnimatedStyle` corre en el HILO DE UI, donde sólo existen worklets: llamar ahí a
  // `headerBlockHeight()` —una función JS normal— revienta con «Tried to synchronously call a
  // non-worklet function on the UI thread». Calculada fuera, el worklet captura un NÚMERO, que sí
  // viaja. Ni el typecheck ni los tests ven este fallo; sólo aparece al ejecutarlo.
  const headerH = headerBlockHeight(width);
  const headerStyle = useAnimatedStyle(() => ({
    // SUBE Y SE DISUELVE. Sólo desplazarse lo dejaría cruzando por delante del buscador que baja al
    // cerrar; sólo disolverse no diría a dónde se fue. Las dos cosas dicen «se aparta».
    opacity: 1 - headerAway.value,
    transform: [{ translateY: -headerAway.value * headerH }],
  }));
  const recordSearch = useRecentSearchesStore((s) => s.record);


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

  // El detalle se abre por SLUG, que es la llave pública del producto (permalink). El UUID es el
  // plan B para los canónicos que todavía no tienen slug: el endpoint resuelve los dos.
  // El estado del plegado vive en refs: se lee y escribe dentro del manejador de scroll, y en
  // estado de React provocaría un repintado por fotograma.
  const lastY = useRef(0);
  const dragAccum = useRef(0);
  const dragging = useRef(false);
  const navHiddenRef = useRef(false);
  const setNavHidden = useNavHideStore((s) => s.setHidden);
  // Sólo aquí la barra se retira sola: es un catálogo largo y cada franja de pantalla cuenta.
  useIdleHideHere();
  // Al salir SIEMPRE se devuelve: una pantalla que se va dejándola escondida se la esconde también
  // a la siguiente, que no tiene forma de saber por qué.
  useEffect(() => () => setNavHidden(false), [setNavHidden]);

  const openProduct = (product: ProductCardDto) =>
    router.push(`/save/supermarket/product/${product.slug || product.id}` as Href);

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
      <SupermarketBackground />
      <ScrollView
        // Dos trabajos, los dos baratos: apuntar dónde quedó la píldora del buscador (`scrollY`, un
        // ref: ni estado ni repintado) y decidir si la barra de tabs se aparta.
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollY.current = y;

          const dy = y - lastY.current;
          lastY.current = y;
          const next = nextHiddenState({
            y,
            maxY: e.nativeEvent.contentSize.height - e.nativeEvent.layoutMeasurement.height,
            viewportH: e.nativeEvent.layoutMeasurement.height,
            dy,
            accum: dragAccum.current,
            dragging: dragging.current,
            hidden: navHiddenRef.current,
          });
          dragAccum.current = next.accum;
          if (next.hidden !== navHiddenRef.current) {
            navHiddenRef.current = next.hidden;
            setNavHidden(next.hidden);
          }
        }}
        // Las mismas guardas que la rejilla y el detalle, desde el MISMO módulo: sin el dedo encima
        // no se decide nada (la inercia no es intención) y hace falta comprometer distancia.
        onScrollBeginDrag={(e) => {
          dragging.current = true;
          dragAccum.current = 0;
          lastY.current = e.nativeEvent.contentOffset.y;
        }}
        onScrollEndDrag={() => {
          dragging.current = false;
        }}
        scrollEventThrottle={16}
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
        <Animated.View style={headerStyle}>
        <SupermarketHeader
          width={width}
          safeTop={insets.top}
          categories={categories.data ?? []}
          // La ruleta también vuelve a aparecer: es la primera cosa que se mira al llegar.
          replay={entranceKey}
          // Mismo cambio de señal que `headerAway`: la ruleta vuelve desde EL TOQUE, no desde el
          // aterrizaje de la barra. Colgada de `searchActive`, las categorías no empezaban a
          // rebotar hasta los 880ms y no acababan hasta pasados 1,8s — eso es lo que se sentía
          // eterno. Y de paso desaparece un efecto tonto: `replay` sube en el toque, así que con
          // `searchActive` todavía encendido las categorías volvían a lanzar su salida.
          away={searchOpen}
          // Al VOLVER del buscador rebotan MÁS TARDE que en una carga normal, porque aquí la
          // elipse no está puesta: está bajando, y los círculos tienen que caer sobre ella en
          // pleno vuelo. `entranceKey` sólo sube al volver del buscador, así que distingue los dos
          // casos sin inventar estado nuevo: en el arranque de la pantalla vale 0.
          //
          // El límite, dicho claro: esto significa «ya se volvió alguna vez», no «se está volviendo
          // ahora». Si el número de categorías cambiara tras una vuelta, ese rebote usaría también
          // el retardo largo. Se acepta a cambio de que la bandera sea ESTABLE: una que se apagara
          // al aterrizar entraría en las dependencias del efecto y dispararía un segundo rebote.
          returning={entranceKey > 0}
          basketCount={compareCount}
          titleLabel={t("save.supermarket.title")}
          backLabel={t("save.supermarket.back")}
          basketLabel={t("save.supermarket.compare")}
          alertsLabel={t("save.alerts.title")}
          onBack={() => router.back()}
          // La canasta lleva a la rejilla: es donde vive la comparación.
          onBasket={() => seeAll("featured")}
          onAlerts={() => router.push("/save/alerts" as Href)}
          onSelectCategory={(slug) =>
            router.push(`/save/supermarket/browse?category=${slug}` as Href)
          }
        />
        </Animated.View>

        {/* EL BUSCADOR, ya fuera del verde: entre el arco y el primer rail. Va FUERA de los estados
            de abajo a propósito — es chrome, no dato. Escondiéndolo mientras cargan los rails, la
            pantalla se quedaría sin su acción principal justo cuando más se tarda en llegar. */}
        <View style={{ paddingHorizontal: GUTTER_X, paddingBottom: SEARCH_GAP }}>
          <HomeSearchBar
            placeholder={t("save.supermarket.searchPlaceholder")}
            // La `y` llega MEDIDA en el toque, no de un layout viejo: si la home se desplazó, el
            // viaje salía del sitio equivocado y la píldora aterrizaba de más. Ver `HomeSearchBar`.
            onOpen={(y) => {
              // ⚠️ SIEMPRE HAY POSICIÓN, y ése es el arreglo.
              //
              // Antes, sin medida, esto simplemente NO actualizaba `searchY` — que en frío vale 0—,
              // y la hoja calculaba un recorrido de 56px (su suelo) en vez de los ~222 reales: la
              // barra nacía pegada al notch. Pasaba en el PRIMER toque tras montar la pantalla,
              // porque `measureInWindow` devuelve 0 en frío y no hay ninguna medida guardada
              // todavía; tocándolo repetidas veces ya había una y por eso «a veces» funcionaba.
              //
              // La posición del buscador nunca hizo falta medirla: se DERIVA. Ver `search-anchor`.
              setSearchY(resolveSearchAnchor({ measured: y, width, scrollY: scrollY.current }));
              setSearchActive(true);
              setSearchOpen(true);
            }}
            hidden={searchActive}
          />
        </View>

        {state === "loading" ? (
          /* El HUECO de lo que viene, con su luz recorriéndolo — no una ruedecita. Una ruedecita
             dice «espera» y nada más; el esqueleto dice QUÉ está por llegar y dónde, así que
             cuando llega no hay salto. Ocupa el sitio exacto (`skeleton-layout`). */
          <RailsSkeleton width={width} gutter={GUTTER_X} />
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
          /* Los rails ENTRAN SUBIENDO al estar listos. El escalonado lo hace CADA RAIL por dentro
             —título, bajada y luego tarjeta a tarjeta—, no este contenedor: subir el rail entero
             como un bloque se lee como una losa que aparece. `entranceOrder` desplaza el arranque
             del segundo para que la cascada baje por la pantalla en vez de sonar dos veces. */
          <View style={{ gap: RAIL_GAP }}>
            <ProductRail
              replay={entranceKey}
              entranceOrder={0}
              title={t("save.supermarket.deals.title")}
              subtitle={t("save.supermarket.deals.subtitle")}
              products={deals.data ?? []}
              gutter={GUTTER_X}
              onFollow={follow}
              onSelect={openProduct}
              onSeeAll={() => seeAll("deals")}
            />
            <ProductRail
              replay={entranceKey}
              entranceOrder={2}
              title={t("save.supermarket.products.title")}
              subtitle={t("save.supermarket.products.subtitle")}
              products={featured.data ?? []}
              gutter={GUTTER_X}
              onFollow={follow}
              onSelect={openProduct}
              onSeeAll={() => seeAll("featured")}
            />
          </View>
        )}
      </ScrollView>

      {/* EL BUSCADOR ABIERTO va FUERA del `ScrollView` y último del árbol, no dentro de la lista:
          tiene que cubrir la pantalla entera y quedarse quieto mientras lo de detrás sigue donde
          estaba. Metido en el scroll se desplazaría con él y quedaría por debajo del contenido. */}
      <SearchOverlay
        visible={searchOpen}
        fromY={searchY}
        placeholder={t("save.supermarket.searchPlaceholder")}
        onClose={() => setSearchOpen(false)}
        // La píldora de reposo VUELVE aquí, no al pulsar cerrar: en ese instante la copia ya
        // aterrizó encima y desapareció, así que el cambio es invisible.
        // La píldora de reposo VUELVE aquí: en este instante la copia ya aterrizó y desapareció.
        onClosed={() => setSearchActive(false)}
        // Y la pantalla repite su entrada ANTES, con la barra todavía bajando: así las dos cosas se
        // solapan y se leen como una sola transición. Ver `RETURN_CUE`.
        onReturning={() => setEntranceKey((n) => n + 1)}
        onSubmit={(query) => {
          // Se guarda ANTES de navegar: si se guardara al volver, una búsqueda que acabó en el
          // detalle de un producto —o en cerrar la app— no quedaría en el historial, que es
          // justamente la que más se repite.
          void recordSearch(query);
          setSearchOpen(false);
          router.push(browseSearchHref(query) as Href);
        }}
      />
    </View>
  );
}
