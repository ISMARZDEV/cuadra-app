import { ArrowLeft, ShoppingBasket } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { ProductCardDto } from "@cuadra/api-client";

import BasketProductCard, {
  cardWidthAt,
  discountOverhangAt,
  gridScaleFor,
} from "@/components/ui/basket-product-card";
import { appBgColorAt } from "@/components/ui/app-background";
import { BG_LIGHT, SupermarketBackground } from "./components/supermarket-background";
import { GlassButton } from "@/components/ui/glass-button";
import { useTabBarClearance } from "@/components/navigation/use-tab-bar-clearance";
import { PillButton } from "@/components/ui/pill-button";
import { t, useLang } from "@/i18n";
import { nextHiddenState } from "@/components/navigation/hide-on-scroll";
import { useIdleHideHere } from "@/components/navigation/use-idle-hide-here";
import { useNavHideStore } from "@/store/nav-hide-store";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import {
  useCategories,
  useCategoryProductsPaged,
  useFeaturedProductsPaged,
  useSearchProductCards,
  useSubscribeAlert,
  useTodaysDealsPaged,
} from "../api";
import { useCompareBasket, useCompareCount } from "../compare-basket";
import { buildTabs, filterByQuery, isListTab, type TabId } from "./browse-state";
import { CategoryTabs } from "./components/category-tabs";
import {
  CurvedHeader,
  HEADER_BULGE,
  HEADER_ROW,
  HEADER_TABS,
} from "./components/curved-header";
import { RevealCard } from "./components/reveal-card";
import { SearchBar } from "./components/search-bar";
import { GridSkeleton } from "./components/supermarket-skeletons";
import { toCardItemView } from "./to-card-item";

// El «ver más» de los rails de Supermarket: la rejilla de 3 columnas con pestañas de categoría.
//
// Arranca en la lista de ORIGEN —de donde vino el usuario al tocar la flecha— y las categorías van
// detrás. Continúa el gesto: pediste ver más de ESO y eso es lo primero que ves.
const GUTTER_X = 14;
/** Aire entre COLUMNAS. */
const GRID_GAP = 10;
/** Aire entre FILAS. Más chico que el de columnas a propósito: cada tarjeta ya reserva arriba el
 *  asomo del sello de oferta, así que sumarle el mismo hueco que a los lados separaba las filas el
 *  doble de lo que se ve entre columnas y la rejilla se leía deshilachada. */
const ROW_GAP = 6;
/** Aire entre la panza del header y el buscador. */
const HEADER_CLEARANCE = 16;
/** Alto de la caja del buscador (`search-bar`). */
const SEARCH_H = 52;
/** Aire bajo el buscador antes de la primera fila.
 *  Más de lo que parece necesario, y a propósito: lo primero que asoma NO es el canto de la tarjeta
 *  sino el sello de oferta, que MONTA por encima de ella. Medido contra el sello —no contra la
 *  tarjeta— un hueco de 16 dejaba el «−35» rozando el buscador. */
const SEARCH_GAP = 34;
/** Cuánto tarda la banda del buscador en disolverse en el fondo. Es lo que evita el canto recto. */
const FADE_TAIL = 44;

/** Por debajo de esto una medida de «viewport» no es creíble y se descarta — ver el uso. */
const MIN_VIEWPORT = 200;
/** La MISMA animación con la que la barra de tabs se va hacia abajo (`cuadra-tab-bar`), porque el
 *  header y la barra se mueven en el mismo gesto: con tiempos distintos, una perseguía a la otra. */
const COLLAPSE_TIMING = { duration: 300 } as const;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<never>);

export type BrowseOrigin = "deals" | "featured";

export function SupermarketBrowseScreen({
  origin,
  category,
  initialQuery,
}: {
  origin: BrowseOrigin;
  /** Slug de la categoría con la que arrancar, si se llegó tocando un círculo del header. */
  category?: string;
  /** Lo escrito en el buscador de la home, si se llegó desde ahí. */
  initialQuery?: string;
}) {
  useLang();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { width, height: windowH } = useWindowDimensions();

  // Arranca en la pestaña de la que vino el usuario: pediste ver más de ESO. Las dos listas
  // transversales están siempre, así que desde aquí se salta a la otra sin volver atrás.
  const [activeTab, setActiveTab] = useState<TabId>(category ?? origin);
  // Arranca con lo que se escribió en la home, si vino de ahí. Es el valor INICIAL y no queda
  // atado al parámetro: a partir de aquí el campo es del usuario, y volver a sembrarlo en cada
  // render le borraría lo que estuviera escribiendo.
  const [query, setQuery] = useState(initialQuery ?? "");

  const deals = useTodaysDealsPaged();
  const featured = useFeaturedProductsPaged("popular");
  const categories = useCategories();
  const onList = isListTab(activeTab);
  const categoryList = useCategoryProductsPaged(onList ? null : activeTab);

  // El icono de la esquina superior derecha de la tarjeta: SEGUIR EL PRECIO. Mismo endpoint que
  // el rail de la home, así que la alerta aparece en el feed de la campana sin nada más que hacer.
  const subscribe = useSubscribeAlert();
  const follow = (productId: string) => subscribe.mutate({ productId });

  const addCompare = useCompareBasket((s) => s.add);
  const removeCompare = useCompareBasket((s) => s.remove);
  // La lista entera, no `has`: un selector que devuelve una FUNCIÓN no re-renderiza cuando cambia
  // el contenido, así que las tarjetas se quedarían con el estado de pertenencia congelado.
  const compareItems = useCompareBasket((s) => s.items);

  // Mismo destino que los rails de la home: por SLUG (permalink), con el UUID de reserva.
  const openProduct = (product: ProductCardDto) =>
    router.push(`/save/supermarket/product/${product.slug || product.id}` as Href);
  const compareCount = useCompareCount();

  const listQuery = activeTab === "deals" ? deals : featured;
  const listLabels = {
    deals: t("save.supermarket.deals.tab"),
    featured: t("save.supermarket.products.title"),
  };

  // BUSCAR manda sobre la pestaña. Y busca en el SERVIDOR, no en memoria: filtrar lo descargado
  // dejó de ser honesto en cuanto la rejilla empezó a paginar — sólo veía el bloque cargado, así
  // que en un catálogo grande enseñaba cuatro resultados como si fueran todos, y con tan pocos no
  // quedaba scroll para pedir más.
  const search = useSearchProductCards(query);
  const searching = query.trim().length >= 2;

  // Las tres fuentes paginan; sólo cambia cómo se llama su lista dentro de la página.
  const pageSource = searching
    ? search.data?.pages.flatMap((page) => page?.items ?? []) ?? []
    : onList
      ? listQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? []
      : categoryList.data?.pages.flatMap((page) => page?.products ?? []) ?? [];
  // El filtro local SIGUE, pero ya sólo para la escritura corta (1 letra), donde no se consulta al
  // servidor. Con 2 o más, lo que se ve viene entero de él.
  const products = searching ? pageSource : filterByQuery(pageSource, query);

  // La consulta VIVA: la que manda en carga, error, paginado y reintento.
  const active = searching ? search : onList ? listQuery : categoryList;
  const loading = active.isLoading;
  const failed = active.isError;

  // GEOMETRÍA DE LA REJILLA. La escala se DERIVA del ancho real y no es una constante: es la misma
  // lección que la sangría del hub — un número fijo es holgado en un Pro Max y desborda en un SE.
  const columnWidth = (width - GUTTER_X * 2 - GRID_GAP * 2) / 3;
  const scale = gridScaleFor(columnWidth);
  const cardWidth = cardWidthAt(scale);
  // El sello de oferta MONTA sobre el canto de la tarjeta: sin reservar este aire, la fila lo
  // recorta y se ve partido por la mitad.
  const overhang = discountOverhangAt(scale);

  const tabs = buildTabs(listLabels, categories.data ?? []);

  // ── Plegado por scroll ────────────────────────────────────────────────────
  // `collapse` 0→1 lo comparten el header, el buscador, la rejilla y la canasta flotante: un solo
  // reloj para todo el gesto, en vez de cuatro animaciones que se persiguen.
  const collapse = useSharedValue(0);
  const lastY = useSharedValue(0);
  // Distancia acumulada en la dirección actual. El DESTINO del plegado no se guarda aparte: es
  // `hiddenSV` (leer `collapse.value` a mitad de animación devuelve un intermedio y la
  // comparación se vuelve ruido).
  const dragAccum = useSharedValue(0);
  // Alimentan la aparición de las tarjetas (`RevealCard`). Viven acá y no en cada ítem: son UN
  // reloj para toda la rejilla, no cincuenta suscripciones al scroll.
  const scrollY = useSharedValue(0);
  // Arranca con el alto de la VENTANA, no en 0: es una aproximación buena del alto de la lista y
  // hace que el primer frame ya calcule algo sensato. Con 0, la ventana entre que se mide la fila y
  // se mide la lista dejaba la rejilla en blanco.
  const viewportH = useSharedValue(windowH);
  const rowHeight = useSharedValue(0);
  // Espejo del booleano para no cruzar a JS en cada frame: `runOnJS` sólo se llama cuando CAMBIA.
  const hiddenSV = useSharedValue(false);
  const setNavHidden = useNavHideStore((s) => s.setHidden);
  // Sólo aquí la barra se retira sola: es un catálogo largo y cada franja de pantalla cuenta.
  useIdleHideHere();
  // El MISMO estado que esconde la barra de tabs decide si la canasta flotante existe: son la misma
  // transición, y con dos señales acabarían desincronizadas.
  const navHidden = useNavHideStore((s) => s.hidden);

  // «Reducir movimiento» del sistema APAGA el efecto. No es un extra: para quien sufre mareo con
  // el movimiento, una rejilla entera que sube y se acerca es exactamente lo que esa preferencia
  // existe para evitar.
  const [motionOk, setMotionOk] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (alive) setMotionOk(!reduced);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (reduced) =>
      setMotionOk(!reduced),
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // La barra de tabs es COMPARTIDA: si esta pantalla se va con la barra escondida, se la esconde
  // también a la siguiente, que no tiene forma de saber por qué. Se devuelve siempre al salir.
  useEffect(() => () => setNavHidden(false), [setNavHidden]);

  // Sólo se decide mientras el DEDO ARRASTRA. La inercia y el rebote también emiten eventos de
  // scroll, y con ellos el plegado oscilaba: al llegar al final, el asentamiento genera deltas en
  // los dos sentidos y el navbar se escondía y reaparecía solo. Esconder la navegación es respuesta
  // a una INTENCIÓN; el impulso no es intención, es física.
  const dragging = useSharedValue(false);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (e) => {
      dragging.value = true;
      dragAccum.value = 0;
      lastY.value = e.contentOffset.y;
    },
    onEndDrag: () => {
      dragging.value = false;
    },
    onScroll: (e) => {
      const y = e.contentOffset.y;

      // El desplazamiento SIEMPRE se publica: alimenta la aparición de las tarjetas, que sí debe
      // seguir a la inercia — lo que no debe seguirla es el plegado.
      scrollY.value = y;
      // Sólo se acepta una medida PLAUSIBLE de viewport. Medido: un layout intermedio llega a
      // reportar 76, y con ese valor toda fila sale con progreso 0 → la rejilla entera invisible.
      if (e.layoutMeasurement.height > MIN_VIEWPORT) {
        viewportH.value = e.layoutMeasurement.height;
      }

      const dy = y - lastY.value;
      lastY.value = y;

      // Las cuatro guardas viven en una función PURA y probada (`hide-on-scroll`), la MISMA que
      // usan el inicio y el detalle. Aquí estuvieron COPIADAS, que es la forma segura de que las
      // tres pantallas se separen en cuanto alguien afine una: cada guarda costó un defecto, y
      // pagarlo tres veces no lo arregla mejor.
      const next = nextHiddenState({
        y,
        maxY: e.contentSize.height - e.layoutMeasurement.height,
        viewportH: e.layoutMeasurement.height,
        dy,
        accum: dragAccum.value,
        dragging: dragging.value,
        hidden: hiddenSV.value,
      });
      dragAccum.value = next.accum;

      if (next.hidden === hiddenSV.value) return;
      hiddenSV.value = next.hidden;
      // UN solo booleano manda las dos cosas: el plegado del header/rejilla y la barra de tabs.
      // Antes había dos espejos del mismo destino (`collapseTarget` y `hiddenSV`) que se ponían
      // en dos sitios distintos — ahí es donde una animación se queda atrás de la otra.
      collapse.value = withTiming(next.hidden ? 1 : 0, COLLAPSE_TIMING);
      runOnJS(setNavHidden)(next.hidden);
    },
  });

  // Cuánto sube el buscador al plegarse: exactamente lo que mide lo que desaparece.
  const COLLAPSE_DISTANCE = HEADER_ROW + HEADER_TABS - 6;

  const searchStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(collapse.value, [0, 1], [0, -COLLAPSE_DISTANCE]) }],
  }));
  const listStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(collapse.value, [0, 1], [0, -COLLAPSE_DISTANCE]) }],
  }));
  // La canasta SE DESPEGA del header y baja a flotar. Aparece cuando el header ya se fue, no a la
  // vez: dos canastas en pantalla durante la transición se leerían como dos cosas distintas.
  // ⚠️ SÓLO TRASLADA. Ni escala ni opacidad, y las dos exclusiones costaron una ronda cada una:
  // este contenedor es ANCESTRO de un `GlassView` NATIVO.
  //   · Escalarlo estira el vidrio ya rasterizado → sale lavado (skill `cuadra-glass-button`).
  //   · Animarle la OPACIDAD lo mete en una capa de composición aparte, y el vidrio deja de
  //     muestrear lo que tiene detrás: se ve el icono pero NO el cristal. Es lo que se fotografió.
  // Por eso la aparición es montar/desmontar + un deslizamiento, no un desvanecido.
  const floatingBasketStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(collapse.value, [0.5, 1], [20, 0]) }],
  }));

  // El chrome ocupa sitio real: el contenido arranca por debajo del buscador. Se descuenta lo que
  // sube al plegarse sumándolo abajo, o la lista se quedaría corta al final.
  const chromeTop = HEADER_BULGE + HEADER_CLEARANCE + SEARCH_H + SEARCH_GAP;

  // EL COLOR DE LA BANDA SE LE PREGUNTA AL FONDO, no se elige.
  //
  // En claro esta pantalla se pinta su propio fondo PLANO (`BG_LIGHT`), así que la banda es ese
  // mismo color y no hay nada que calcular. En oscuro el fondo es el DEGRADADO de la app, y ahí un
  // color a ojo se ve: el `#0B0B0B` que había antes es gris neutro, y el fondo a esa altura vale
  // `#010606` —tirando a teal—. Se leía como un rectángulo más claro detrás del buscador.
  //
  // Basta un color PLANO por superficie —el de su punto medio— y no una réplica del degradado:
  // medido sobre el alto de la ventana, la banda entera abarca ~11% del recorrido del degradado,
  // que son menos de 2/255 de diferencia entre su borde de arriba y el de abajo. Por debajo de lo
  // que la pantalla puede enseñar; replicar el degradado sería precisión que nadie ve.
  const bandTopY = insets.top + HEADER_ROW + HEADER_TABS;
  const bandH = HEADER_BULGE + HEADER_CLEARANCE + SEARCH_H;
  const bandColor = isDark ? appBgColorAt("dark", (bandTopY + bandH / 2) / windowH) : BG_LIGHT;
  // El degradado que disuelve la banda arranca donde ella acaba, así que pregunta por SU altura.
  const fadeColor = isDark
    ? appBgColorAt("dark", (bandTopY + bandH + FADE_TAIL / 2) / windowH)
    : BG_LIGHT;

  return (
    <View className="flex-1">
      <SupermarketBackground />

      <CurvedHeader
        // Título ESTABLE: nombra lo que ES la pantalla —un navegador por categorías—, no la pestaña
        // en la que estás. Antes llevaba el nombre de la lista de origen y quedaba repetido palabra
        // por palabra en la pestaña de debajo.
        title={t("save.supermarket.categories")}
        progress={collapse}
        safeTop={insets.top}
        backIcon={ArrowLeft}
        backLabel={t("save.supermarket.back")}
        onBack={() => router.back()}
        basketIcon={ShoppingBasket}
        basketLabel={t("save.supermarket.compare")}
        basketCount={compareCount}
      >
        <CategoryTabs tabs={tabs} activeSlug={activeTab} onSelect={setActiveTab} gutter={GUTTER_X} />
      </CurvedHeader>

      {/* El buscador NO se scrollea: sube con el header y se queda. Es la herramienta de la
          pantalla, y perderla al bajar obliga a volver arriba sólo para buscar.
          Va sobre una BANDA OPACA a todo el ancho, no suelto: sin ella los productos se ven pasar
          por los huecos que deja la píldora y el buscador parece flotar sobre un collage. La banda
          arranca justo donde acaba la panza del header, así que entre los dos no queda ninguna
          rendija por la que asome el contenido. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            // Arranca en el canto del RECTÁNGULO verde, no en el fondo de la panza: la curva sólo
            // baja en el CENTRO, así que en los costados el verde termina `HEADER_BULGE` más
            // arriba y por esa rendija asomaban las tarjetas.
            top: insets.top + HEADER_ROW + HEADER_TABS,
            height: HEADER_BULGE + HEADER_CLEARANCE + SEARCH_H + SEARCH_GAP,
            // POR DEBAJO del header (zIndex 2) a propósito: así la panza se pinta ENCIMA de la
            // banda y la curva sobrevive, en vez de quedar tapada por un borde recto.
            zIndex: 1,
          },
          searchStyle,
        ]}
      >
        {/* DOS piezas, y hacen falta las dos.
            (1) Una banda OPACA detrás de la píldora: ahí no vale un desvanecido. Se probó con
            `TopScrollFade` y su lavado va al 65% A PROPÓSITO —está pensado para insinuar que arriba
            hay más—, así que los productos se transparentaban detrás del buscador.
            (2) Un degradado DEBAJO de esa banda, que la disuelve en el fondo. Sin él, la banda
            termina en un canto recto que parte las tarjetas por la mitad: un corte limpio dice «acá
            se acaba» y lo que queremos decir es «esto sigue». */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: HEADER_BULGE + HEADER_CLEARANCE + SEARCH_H,
            backgroundColor: bandColor,
          }}
        />
        <Svg
          width="100%"
          height={FADE_TAIL}
          preserveAspectRatio="none"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: HEADER_BULGE + HEADER_CLEARANCE + SEARCH_H,
            left: 0,
            right: 0,
          }}
        >
          <Defs>
            <LinearGradient id="searchFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fadeColor} stopOpacity="1" />
              <Stop offset="1" stopColor={fadeColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#searchFade)" />
        </Svg>
        <View
          style={{ paddingTop: HEADER_BULGE + HEADER_CLEARANCE, paddingHorizontal: GUTTER_X }}
        >
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder={t("save.supermarket.searchPlaceholder")}
            filtersLabel={t("save.supermarket.filters")}
          />
        </View>
      </Animated.View>

      {/* El margen NEGATIVO estira la caja `COLLAPSE_DISTANCE` por DEBAJO del borde de la pantalla.
          Sin él, al plegarse la lista sube esa misma distancia y su canto inferior queda flotando
          por encima del final del móvil: las tarjetas se cortaban a media altura y debajo asomaba
          una franja del fondo. Estirada, al subir aterriza EXACTO en el canto y el contenido llega
          hasta abajo del todo. */}
      <Animated.View style={[{ flex: 1, marginBottom: -COLLAPSE_DISTANCE }, listStyle]}>
        <AnimatedFlatList
          data={products as never[]}
          numColumns={3}
          keyExtractor={(p: never) => (p as { id: string }).id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // ── VENTANA DE LA REJILLA ────────────────────────────────────────────
          // `windowSize` POR DEFECTO ES 21 — o sea, `FlatList` mantiene montadas unas DIEZ
          // pantallas por arriba y otras diez por abajo. En una rejilla de tres columnas con foto
          // eso son ~180 tarjetas vivas con sus imágenes decodificadas, y es de donde salía buena
          // parte de la RAM medida en el aparato (1.2 GB con el hilo de JS a 21 fps).
          //
          // A 5 se conservan dos pantallas a cada lado: suficiente para que un scroll normal nunca
          // vea un hueco, y una décima parte de la memoria.
          windowSize={5}
          // Lo que cabe en una pantalla: cuatro filas de tres. Menos deja la rejilla a medio pintar
          // al entrar; más retrasa el primer fotograma útil.
          initialNumToRender={12}
          // Tres filas por tanda. Es el compromiso entre llenar rápido al desplazar y no bloquear
          // el hilo de JS con un lote grande justo mientras el dedo se mueve.
          maxToRenderPerBatch={9}
          updateCellsBatchingPeriod={50}
          // DESCONECTA del árbol nativo lo que sale de pantalla. Es lo que de verdad libera las
          // imágenes: sin esto las vistas siguen adjuntas —invisibles pero vivas— y sus mapas de
          // bits siguen ocupando memoria.
          removeClippedSubviews
          // NO se pasa `getItemLayout`, y es a propósito: la tarjeta NO tiene alto fijo —crece con
          // su contenido, ver `basket-product-card`—, así que cualquier alto que declarásemos aquí
          // sería MENTIRA y descalibraría el scroll. Un `getItemLayout` que miente es peor que no
          // tenerlo.
          // La rejilla NO se remonta al cambiar de pestaña, así que hay que devolverla arriba a
          // mano: sin esto, entrar a una categoría desde la fila 8 te deja mirando el hueco donde
          // ya no hay productos.
          key={`${activeTab}|${searching ? query.trim() : ""}`}
          ListEmptyComponent={
            loading ? (
              /* El HUECO de la rejilla, con su luz recorriéndolo — no una ruedecita. Ocupa el sitio
                 EXACTO de las tarjetas que van a llegar (`skeleton-layout`), así que al llegar no
                 hay salto. Va dentro de la lista vacía, así que el chrome de arriba —header,
                 pestañas y buscador— ya está puesto y no aparece después. */
              <GridSkeleton
                width={width - GUTTER_X * 2}
                gutter={0}
                cardWidth={cardWidth}
                columnGap={GRID_GAP}
                rowGap={ROW_GAP}
                rows={4}
              />
            ) : failed ? (
              // Un FALLO no se dibuja como «no hay productos»: son cosas distintas y confundirlas
              // deja al usuario creyendo que el súper está vacío cuando lo que se cayó fue la red.
              // Y sin botón, además, no le queda nada que hacer.
              <View className="items-center pt-16" style={{ gap: 6 }}>
                <Text className="text-base text-text" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
                  {t("save.supermarket.error.title")}
                </Text>
                <Text
                  className="text-center text-sm text-text/60"
                  style={{ fontFamily: KANTUMRUY_MEDIUM }}
                >
                  {t("save.supermarket.error.body")}
                </Text>
                <PillButton
                  label={t("save.supermarket.error.retry")}
                  onPress={() => void active.refetch()}
                />
              </View>
            ) : (
              <View className="items-center pt-16">
                <Text
                  className="text-center text-sm text-text/60"
                  style={{ fontFamily: KANTUMRUY_MEDIUM }}
                >
                  {query.trim() ? t("save.supermarket.noResults") : t("save.supermarket.empty")}
                </Text>
              </View>
            )
          }
          // Pedir el siguiente bloque ANTES de tocar fondo: con el umbral en 0 el usuario ve el
          // final y espera; a media pantalla de distancia, los productos nuevos ya están puestos
          // cuando llega. `onList` no pagina — esas listas vienen acotadas del servidor.
          onEndReached={() => {
            if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            active.isFetchingNextPage ? (
              /* Al pedir la página siguiente NO se pone una ruedecita: se ponen las FILAS que
                 vienen, vacías y con la luz recorriéndolas. Así el scroll no topa con un final —
                 se puede seguir bajando— y cada tarjeta se limita a rellenar su hueco en vez de
                 empujar la lista hacia abajo cuando llega. La ruedecita decía «espera»; esto dice
                 «sigue, que ya viene». */
              <View style={{ marginTop: ROW_GAP }}>
                <GridSkeleton
                  width={width - GUTTER_X * 2}
                  gutter={0}
                  cardWidth={cardWidth}
                  columnGap={GRID_GAP}
                  rowGap={ROW_GAP}
                  rows={2}
                />
              </View>
            ) : null
          }
          columnWrapperStyle={{ gap: GRID_GAP }}
          contentContainerStyle={{
            paddingHorizontal: GUTTER_X,
            paddingTop: chromeTop,
            // Se suma lo que la lista sube al plegarse: sin ello el último producto queda por
            // debajo del borde y no hay forma de alcanzarlo.
            paddingBottom: tabBarClearance + 24 + COLLAPSE_DISTANCE,
            // Sin sumar el asomo: cada tarjeta ya lo reserva por su cuenta (`paddingTop` del item),
            // y contarlo dos veces era lo que separaba las filas de más.
            gap: ROW_GAP,
          }}
          renderItem={({ item, index }: { item: never; index: number }) => {
            const dto = item as unknown as Parameters<typeof toCardItemView>[0];
            const view = toCardItemView(dto, index);
            return (
              <RevealCard
                index={index}
                columns={3}
                rowHeight={rowHeight}
                scrollY={scrollY}
                viewportH={viewportH}
                contentTop={chromeTop}
                enabled={motionOk}
                width={cardWidth}
                paddingTop={overhang}
                // El alto de fila se mide UNA vez, en la PRIMERA tarjeta: todas miden lo mismo (los
                // bloques de la tarjeta tienen alto FIJO, ver `basket-product-card`), así que medir
                // las cincuenta sería cincuenta veces el mismo número.
                onMeasure={index === 0 ? (h) => (rowHeight.value = h + ROW_GAP) : undefined}
              >
                <BasketProductCard
                  scale={scale}
                  item={view.item}
                  currency={view.currency}
                  badge={view.badge}
                  discountBps={view.discountBps}
                  previousPrice={view.previousPrice}
                  // El CUERPO abre el detalle y el «+» es el interruptor de la canasta — un
                  // gesto, un significado, igual que en los rails de la home. Antes la tarjeta
                  // entera era el interruptor y no había forma de llegar al producto.
                  onSelect={() => openProduct(dto)}
                  quantity={compareItems.some((p) => p.id === dto.id) ? 1 : 0}
                  onQuantityChange={(qty) =>
                    qty > 0 ? addCompare({ id: dto.id, name: dto.name }) : removeCompare(dto.id)
                  }
                  onBookmark={() => follow(dto.id)}
                />
              </RevealCard>
            );
          }}
        />
      </Animated.View>

      {/* La canasta, ya despegada del header. Va sobre la barra de tabs escondida, que es el sitio
          que acaba de quedar libre.
          Se MONTA y DESMONTA con el plegado en vez de desvanecerse — ver `floatingBasketStyle`. */}
      {navHidden ? (
      <Animated.View
        pointerEvents="box-none"
        style={[
          { position: "absolute", right: GUTTER_X + 4, bottom: insets.bottom + 24, zIndex: 4 },
          floatingBasketStyle,
        ]}
      >
        <GlassButton
          icon={ShoppingBasket}
          label={t("save.supermarket.compare")}
          size={56}
          badge={compareCount}
        />
      </Animated.View>
      ) : null}
    </View>
  );
}
