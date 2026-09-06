import { ArrowLeft, ShoppingBasket } from "lucide-react-native";
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { saveBgFor, SupermarketBackground } from "../components/supermarket-background";
import { TopScrollFade } from "@/components/ui/top-scroll-fade";
import { PillButton } from "@/components/ui/pill-button";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import {
  useAddToGroup,
  useBrandProducts,
  useCreateGroup,
  useMyGroups,
  usePriceHistory,
  useProductComparison,
  useProductStores,
  useRemoveFromGroup,
  useSimilarProducts,
} from "../../api";
import { nextHiddenState } from "@/components/navigation/hide-on-scroll";
import { NAV_HIDE_TIMING } from "@/components/navigation/nav-hide-motion";
import { useNavVisibility } from "@/components/navigation/use-nav-visibility";
import { useNavHideStore } from "@/store/nav-hide-store";

import { useCompareCount } from "../../compare-basket";
import { LAYER } from "../layers";
import { useHeaderColorFor } from "./header-color-store";
import { CurvedHeader, HEADER_BULGE, HEADER_ROW } from "../components/curved-header";
import { ChooseGroupSheet } from "./components/choose-group-sheet";
import { ChooseStoreSheet } from "./components/choose-store-sheet";
import { FOOTER_CLEARANCE, ProductFooter } from "./components/product-footer";
import { PriceHistoryChart } from "./components/price-history-chart";
import { ProductSections } from "./components/product-sections";
import { CascadeItem } from "@/components/ui/cascade-item";
import { BackToTopHandle } from "./components/back-to-top-handle";
import { HeroPhotoCard } from "./components/hero-photo-card";
import { ProductEntrance, useEntranceVisit } from "./components/product-entrance";
import { ProductSummary } from "./components/product-summary";
import { entranceKeyOf, STEPS } from "./motion/entrance";
import { pointsForProvider } from "./hero";
import { galleryOf, hasCarousel } from "./gallery";
import { DOTS_BAND } from "./components/gallery-dots";
import {
  collapseDistance,
  headerCollapse,
  headerContentFade,
  headerShrinkOf,
  PHOTO_GAP,
  snapOffsetsFor,
} from "./motion/gallery-collapse";
import { StorePanel } from "./components/store-panel";
import { ProductRail } from "../components/product-rail";
import { useDeliberateSheet } from "./motion/use-deliberate-sheet";
import { resolveProductState, type ProductState } from "./product-state";
import { storeStandings, type StoreStanding } from "./product-view";

/**
 * Detalle de un producto: qué es, cuánto cuesta y — lo que de verdad importa en Save — en qué
 * tienda sale más barato.
 *
 * El producto se resuelve por SLUG, que es su llave pública (permalink). El endpoint acepta el
 * UUID de reserva, así que un canónico sin slug todavía se puede abrir.
 */
/**
 * Cuánto verde EXTRA cuelga bajo la fila de botones antes de que arranque la curva.
 *
 * El diseño le da a la cabecera bastante más aire del que ocupa la fila: es lo que le deja sitio a
 * la tarjeta de la foto para montarse encima sin taparle los controles. Vive aquí y no dentro del
 * header porque es una decisión de ESTA pantalla — las demás quieren la curva pegada a la fila.
 */
const HEADER_BELOW_ROW = 76;

/**
 * Cuánto se mete el tirador DENTRO del verde, medido desde el canto de la panza.
 *
 * Va por dentro y no colgando: el tirador es parte de la cabecera, y posado justo en el borde se
 * lee como un elemento del contenido que quedó pegado ahí por casualidad. Es EL número a mover si
 * queda alto o bajo.
 */
const INDICATOR_INSET = 26;

/**
 * Alto de la banda de desenfoque que va bajo la cabecera.
 *
 * Cubre la panza y le sobra un tramo: el verde tapa los primeros `HEADER_BULGE` puntos por el
 * CENTRO —que es donde la curva baja más— así que sin ese extra el degradado se gastaría escondido
 * justo donde el título lo necesita.
 */
const TOP_FADE_HEIGHT = HEADER_BULGE + 48;

export function ProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const setForceHidden = useNavHideStore((s) => s.setForceHidden);

  // ⭐ En el detalle la barra de tabs SE VA, no se le reserva sitio. El pie fijo ocupa exactamente
  // ese lugar, y tener las dos cosas ahí abajo sería pedirle al pulgar que elija entre dos barras.
  //
  // Se ata al FOCO, no al montaje: al empujar otra pantalla encima ésta no se desmonta, y con un
  // `useEffect` la barra seguiría escondida en la de destino. Y el retorno del efecto la devuelve
  // SIEMPRE — el propio store avisa de que quien la esconde y no la restaura se la esconde también
  // a la siguiente pantalla, que no tiene forma de saber por qué.
  useFocusEffect(
    useCallback(() => {
      setForceHidden(true);
      return () => setForceHidden(false);
    }, [setForceHidden]),
  );
  const compareCount = useCompareCount();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // Arranca en 0: la cantidad dice cuántos has añadido a la lista, y al abrir el detalle no has
  // añadido ninguno. Un 1 de salida afirma algo que el usuario no hizo.
  const [quantity, setQuantity] = useState(0);
  const [chooserOpen, setChooserOpen] = useState(false);


  const comparison = useProductComparison(slug ?? "");
  // Va por SLUG, así que NO espera al waterfall: vuela junto con la comparación.
  const stores = useProductStores(slug ?? "");
  // Éste SÍ espera al waterfall: se pide por `canonical_product_id`, que llega DENTRO de la
  // comparación. Es una sección que se pinta y falla sola — que no haya historial no puede tumbar
  // el precio, y por eso no entra en `resolveProductState`.
  const history = usePriceHistory(comparison.data?.canonical_product_id);
  // Las dos preguntas contrarias: alternativas (ahorro) y más de la marca (fidelidad). Las dos
  // esperan al waterfall y las dos son costillas — fallan solas sin tumbar la pantalla.
  const similar = useSimilarProducts(comparison.data?.canonical_product_id);
  const brand = useBrandProducts(comparison.data?.canonical_product_id);


  // El pie se va y vuelve con el scroll, EXACTAMENTE como la barra de tabs: mismo disparador
  // (arrastrar hacia abajo), mismo viaje y —lo importante— el mismo `NAV_HIDE_TIMING`. Si cada
  // barra pusiera el suyo, el mismo gesto se sentiría distinto según qué pantalla estuviera abierta.
  // ⭐ Arranca FUERA (1) y sube al entrar: la barra ENTRA en la pantalla igual que la de inicio,
  // en vez de aparecer ya puesta. Aparecer de golpe la delata como una capa pegada encima; subir
  // dice que pertenece a esta pantalla y que llegó con ella.
  // ── La tarjeta de la foto ─────────────────────────────────────────────────────────────────────
  //
  // ⭐ Se DERIVA de la pantalla, no es un número fijo: en la referencia ocupa cerca de un 36% del
  // alto, y un valor clavado sería generoso en un Pro Max y ahogaría la foto en un SE. Las cotas
  // sólo evitan los dos extremos absurdos.
  // ⭐ NO es cuadrada: el mock la da 302,7 × 322 sobre una pantalla de 402pt de ancho. Se deriva del
  // ANCHO y no del alto —es lo que el diseño fija— y conserva esa proporción, así que en un SE y en
  // un Pro Max se lee igual de grande en relación a la pantalla.
  const photoWidth = Math.round(windowW * (302.714 / 402));
  const photoHeight = Math.round(photoWidth * (322 / 302.714));
  // ⭐ La galería se resuelve ACÁ ARRIBA y no junto a la tarjeta porque de ella depende la
  // GEOMETRÍA: con carrusel hay una banda de puntos entre la foto y el título que ocupa sitio, y
  // sin él no. Quien calcule el recorrido sin saberlo deja al título 23pt fuera de su sitio.
  const images = galleryOf(comparison.data?.image_urls, comparison.data?.image_url);
  // Con una sola foto no hay puntos, así que tampoco banda: reservar un hueco vacío bajaría el
  // título sin motivo.
  const dotsBand = hasCarousel(images.length) ? DOTS_BAND : 0;
  // Dónde se posa el canto superior de la tarjeta, en coordenadas de PANTALLA — se mide desde
  // arriba porque la tarjeta vive fuera del scroll. Derivado de la geometría del header y no
  // escrito a ojo: si alguien toca la curva o el alto de la fila de botones, esto sigue cuadrando.
  //
  // ⭐ Lo usan DOS sitios que tienen que coincidir o el nombre del producto acaba leyéndose por
  // debajo de la foto: la propia tarjeta y el hueco que se le reserva en el flujo (`photoSlot`).
  const photoTop = insets.top + HEADER_ROW + PHOTO_GAP;
  // Lo que hay que reservarle DENTRO del flujo, para que el título no suba hasta el header: desde
  // donde empieza el scroll hasta donde termina la tarjeta. Se acota en 0 porque con una cabecera
  // muy alta la tarjeta podría acabar por encima del inicio del contenido, y un hueco negativo
  // subiría el título en vez de bajarlo.
  const scrollTop = insets.top + HEADER_ROW + HEADER_BELOW_ROW;
  // El BLOQUE entero de la galería: la tarjeta MÁS la banda de puntos que va debajo.
  const photoSlot = Math.max(0, photoTop + photoHeight + dotsBand - scrollTop);

  /**
   * ⭐ Cuánto scroll dura el plegado ENTERO, derivado de la pantalla y no escrito a mano.
   *
   * Termina exactamente cuando el canto inferior de la tarjeta se mete bajo la cabecera compacta.
   * De aquí cuelgan los cuatro tramos (foto, controles, cáscara, tirador) como FRACCIONES, así que
   * la coreografía es la misma en un SE y en un Pro Max y sólo cambia cuánto dedo cuesta.
   */
  const collapseGeometry = {
    headerRow: HEADER_ROW,
    // ⭐ La PANZA cuenta: cuelga por debajo de la caja del header, así que el canto real del verde
    // está ese tanto más abajo. Sin ella el contenido sube de más y el título queda detrás.
    headerBulge: HEADER_BULGE,
    belowRow: HEADER_BELOW_ROW,
    dotsBand,
    photoGap: PHOTO_GAP,
    photoHeight,
  };
  const collapseDist = collapseDistance(collapseGeometry);
  // El alto del header DESPLEGADO, el mismo que calcula `CurvedHeader`. De aquí cuelga la banda de
  // desenfoque, que tiene que seguir al canto del verde mientras encoge.
  const headerExpanded = insets.top + HEADER_ROW + HEADER_BELOW_ROW;
  // ⭐⭐ Lo que el contenido sube DE REGALO cuando el verde encoge: el `ScrollView` es hermano del
  // header y su techo baja con él. La tarjeta vive fuera del scroll, así que hay que dárselo a mano
  // o ella y su propio hueco divergen.
  const headerShrink = headerShrinkOf(collapseGeometry);
  // Las dos orillas del plegado. El estado intermedio no es un estado: a mitad de camino hay una
  // cabecera a medio encoger que no es ninguna de las dos cosas que la pantalla sabe ser.
  const snapOffsets = snapOffsetsFor(collapseDist);

  /**
   * El relleno del scroll, ESTABLE entre renders.
   *
   * Un objeto nuevo en cada render obliga al `ScrollView` a re-aplicar su layout aunque los números
   * no hayan cambiado — y esta pantalla re-renderiza a menudo (cantidad, hoja, datos que llegan).
   *
   * ⭐ SIN colchón arriba para la panza. Con la curva CÓNCAVA el verde baja en los LADOS y el blanco
   * sube por el CENTRO, así que el contenido centrado —el tirador y la foto— tiene sitio libre ahí.
   * El colchón de `HEADER_BULGE` era el correcto para la curva convexa de la home, donde la panza
   * cuelga justo por el medio; aquí sólo empujaba la foto 28pt hacia abajo sin motivo.
   */
  const contentPadding = useMemo(
    () => ({ paddingTop: 0, paddingBottom: insets.bottom + FOOTER_CLEARANCE }),
    [insets.bottom],
  );

  // El desplazamiento del scroll, PUBLICADO: la tarjeta de la foto vive fuera de la lista y lo
  // necesita para viajar con ella. Un solo número compartido, no un segundo reloj.
  const scrollY = useSharedValue(0);
  // El ref del scroll, sólo para que el tirador pueda volver arriba. El plegado NO lo usa: cuelga
  // de `scrollY` y no llama a nadie.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Dónde empiezan las secciones plegables, en coordenadas del contenido. Lo publica el `onLayout`
  // de su envoltorio y lo consume «Más información».
  //
  // ⭐ Es un `ref` y no estado a propósito: sólo se lee dentro de un gesto, así que guardarlo en
  // estado provocaría un render por cada medición sin cambiar ni un píxel de lo que se ve.
  const sectionsY = useRef(0);
  // ⭐ La cabecera se compacta DERIVADA del mismo `scrollY` que pliega la galería, no de un estado
  // propio. Por eso la vuelta no hay que escribirla: no hay animación de ida y otra de vuelta que
  // puedan discrepar, hay un número que sube y baja con el dedo. Ver `gallery-collapse`.
  const collapse = useDerivedValue(() => headerCollapse(scrollY.value, collapseDist));
  // La banda de desenfoque VIAJA con el canto del verde: la cabecera encoge, y con un `top` fijo la
  // banda se quedaría flotando a media pantalla — el mismo defecto que ya tuvo el tirador.
  const topFadeStyle = useAnimatedStyle(() => ({
    top: headerExpanded - headerShrink * headerCollapse(scrollY.value, collapseDist),
  }));
  // ⭐ El título y los botones llevan SU PROPIO tramo, no el de la cáscara: se apagan mientras la
  // tarjeta de la foto les pasa por encima —tapados— y para cuando ella los libera ya no están.
  // Con el reloj de la cáscara se apagaban a la vista, que es un guiño sin causa.
  const headerContent = useDerivedValue(() => headerContentFade(scrollY.value, collapseDist));

  const footerHidden = useSharedValue(1);
  const dragging = useSharedValue(false);
  const lastY = useSharedValue(0);
  const dragAccum = useSharedValue(0);
  const hiddenSV = useSharedValue(false);

  // ⭐ ANCLADA con cantidad ≥ 1: entonces NINGÚN scroll la esconde. Vive en un shared value porque
  // quien lee esto es el worklet del scroll, y desde el hilo de UI no se puede mirar estado de React.
  const pinned = useSharedValue(false);
  pinned.value = quantity > 0;

  // Las MISMAS tres reglas que la barra de inicio, desde el mismo módulo: scroll abajo esconde,
  // el reposo esconde, un TOQUE trae de vuelta. Anclada (cantidad ≥ 1) gana a las tres.
  const nav = useNavVisibility({ pinned: quantity > 0 });

  // Publica el scroll y conduce el pie flotante. Ni el plegado ni el imán se deciden aquí: el
  // primero cuelga de `scrollY`, el segundo lo hace la plataforma con `snapToOffsets`.
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
      scrollY.value = y;
      const dy = y - lastY.value;
      lastY.value = y;

      // Las cuatro guardas viven en una función PURA y probada (`hide-on-scroll`), no repetidas
      // aquí: cada una costó un defecto en la rejilla del «ver más», y copiarlas sería garantizar
      // que las dos pantallas se separen en cuanto alguien afine una.
      const next = nextHiddenState({
        y,
        maxY: e.contentSize.height - e.layoutMeasurement.height,
        viewportH: e.layoutMeasurement.height,
        dy,
        accum: dragAccum.value,
        dragging: dragging.value,
        hidden: hiddenSV.value,
        pinned: pinned.value,
      });
      dragAccum.value = next.accum;

      if (next.hidden !== hiddenSV.value) {
        hiddenSV.value = next.hidden;
        // Se lo dice al controlador en vez de animar aquí: él reúne las tres causas y rearma el
        // reposo. Con dos sitios animando el mismo valor, el reposo y el scroll se pisarían.
        runOnJS(nav.setHiddenByScroll)(next.hidden);
      }
    },
  });

  // ⭐ Atado a un `const` a propósito: el estrechado de `comparison.data` NO sobrevive dentro de la
  // clausura del render-prop de `ProductEntrance` (TypeScript no puede saber que no cambió entre
  // el render y la llamada). Con la constante, sobrevive — y de paso el JSX se lee mejor.


  const product = comparison.data;
  // Cada LLEGADA a la pantalla es una entrada nueva, aunque sea al mismo producto. Ver
  // `useEntranceVisit`: la key del dueño del reloj lleva las dos causas, producto y visita.
  const visit = useEntranceVisit();
  // El color de la cabecera de ESTA llegada, del mazo que garantiza que no se repita — ver
  // `header-palette.ts`. La llave es el SLUG y no la del entrance: aquélla cambia a mitad de carga
  // (arranca con el slug y pasa al `canonical_product_id`), y repartiría dos cartas por llegada.
  const headerSkin = useHeaderColorFor(`${slug ?? ""}#${visit}`);
  // Cuándo montó LA PANTALLA. De aquí sale cuánto falta para que termine de deslizarse hacia
  // dentro, que es cuando la cascada puede arrancar sin gastarse en un sitio donde no se ve.
  // Inicializador PEREZOSO: con `useRef(Date.now())` la fecha se recalcularía en cada render.
  const [screenMountedAt] = useState(() => Date.now());

  // Un solo cálculo para el precio grande, los avatares y (en la fase 3) la tabla y sus tiles:
  // derivarlos por separado es cómo el panel del admin acabó con tres números que no cerraban.
  const standings = storeStandings(stores.data ?? []);
  const best = standings[0];
  // La entrada de la comparación de la tienda MÁS BARATA. El precio grande sale del panel de
  // tiendas y el unitario de aquí: buscarlos por el mismo `provider_id` es lo único que impide que
  // acaben describiendo envases distintos.
  const cheapestEntry = product?.entries?.find((e) => e.provider_id === best?.row.provider_id);
  // La tendencia habla de ESA tienda, no de todas mezcladas.
  const historyPoints = pointsForProvider(history.data?.series, best?.row.provider_id);


  // La página se atenúa y RETROCEDE mientras la hoja está arriba; no se desmonta. Recuperarla
  // exactamente donde se dejó es el argumento entero del regreso lento del patrón.
  const { hostStyle, sheetStyle, veilStyle, onSheetLayout } = useDeliberateSheet(chooserOpen);

  // ── Categoría ───────────────────────────────────────────────────────────────────────────────
  //
  // ⭐ **La RAÍZ del breadcrumb, no la hoja.** Sólo las de primer nivel tienen ilustración exportada
  // (`category-images` va por slug y es un mapa explícito), y son las que el usuario reconoce de la
  // ruleta de la home: «Despensa & Abarrotes» le dice algo, «Cremas y leches vegetales» es una rama
  // que no ha visto nunca. Sin breadcrumb no hay fila — ver `ProductSummary`.
  const rootCategory = comparison.data?.breadcrumb?.[0] ?? null;

  // ── Grupos ──────────────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ La hoja de grupos tiene su PROPIO reloj de movimiento. Las dos hojas nunca están abiertas a
  // la vez, pero cada una mide SU alto y de ese alto sale el viaje: compartir un reloj las obligaría
  // a compartir también la medida, y la que no estuviera abierta la falsearía.
  const [groupsOpen, setGroupsOpen] = useState(false);
  const groupMotion = useDeliberateSheet(groupsOpen);
  const canonicalId = comparison.data?.canonical_product_id;
  const groups = useMyGroups(canonicalId);
  const createGroup = useCreateGroup();
  const addToGroup = useAddToGroup();
  const removeFromGroup = useRemoveFromGroup();
  // El producto está «en un grupo» si está en ALGUNO: es lo que el marcador de la fila dice, y no
  // hay marcador por grupo.
  const inSomeGroup = (groups.data ?? []).some((g) => g.contains);

  // Save compara, no vende: el destino de una tienda es SU web. Sin `url` no se hace nada — abrir
  // una búsqueda inventada sería mandar al usuario a adivinar.
  // Saltar de un producto a otro REEMPLAZA la pantalla en vez de apilarla: con `push`, mirar cinco
  // alternativas seguidas deja cinco detalles en la pila y volver atrás se vuelve un laberinto.
  const openProduct = (product: { slug?: string | null; id: string }) =>
    router.replace(`/save/supermarket/product/${product.slug || product.id}` as Href);

  // La hoja del árbol: la categoría que de verdad describe al producto, no la raíz.
  const categorySlug = comparison.data?.breadcrumb?.[comparison.data.breadcrumb.length - 1]?.slug;

  const openStore = (standing: StoreStanding) => {
    const url = standing.row.url;
    if (url) void Linking.openURL(url);
  };

  // UN solo conductor para el viaje del pie: se va por REPOSO o por SCROLL, y las dos causas
  // escriben el mismo valor con el mismo tiempo. Con un shared value por causa, coincidirían hoy y
  // se separarían en cuanto alguien tocara una duración.
  // ⚠️ Depende de `hasContent`: el pie SÓLO se monta cuando hay datos, y con el efecto atado al
  // montaje de la PANTALLA el viaje de entrada se gastaba mientras el pie todavía no existía — al
  // aparecer ya estaba puesto y no se veía entrar.
  const hasContent = Boolean(comparison.data);
  // UN solo sitio anima el viaje del pie, con las tres causas ya reunidas por el controlador.
  useEffect(() => {
    if (!hasContent) return;
    footerHidden.value = withTiming(nav.hidden ? 1 : 0, NAV_HIDE_TIMING);
    hiddenSV.value = nav.hidden;
  }, [hasContent, nav.hidden, footerHidden, hiddenSV]);

  const state = resolveProductState({
    isLoading: comparison.isLoading,
    isError: comparison.isError,
    status: (comparison.error as { status?: number } | null)?.status,
    hasData: Boolean(comparison.data),
  });

  return (
    // El detector de toques envuelve la pantalla entera: `onTouchStart`/`onTouchEnd` burbujean
    // desde cualquier hijo sin reclamar el gesto. Un toque trae el pie; un arrastre no.
    <View className="flex-1" onTouchStart={nav.onTouchStart} onTouchEnd={nav.onTouchEnd}>
      {/* Cada pantalla de un Stack anidado SE PINTA SU FONDO. Confiar en el de la raíz se ve bien
          quieto y se rompe al empujar: la saliente transparente no se oculta y se transparenta
          bajo la entrante (expo/expo#33040). */}
      <SupermarketBackground />

      <CurvedHeader
        skin={headerSkin}
        title={t("save.product.title")}
        progress={collapse}
        safeTop={insets.top}
        backIcon={ArrowLeft}
        backLabel={t("save.product.back")}
        onBack={() => router.back()}
        basketIcon={ShoppingBasket}
        basketLabel={t("save.supermarket.compare")}
        basketCount={compareCount}
        // La MISMA elipse convexa que la cabecera de Categorías: el verde baja en el centro como
        // una gota. Se probó invertida (cóncava) y el diseño la quiere igual que la del resto de
        // Supermarket — una sola forma de cabecera en toda la vertical.
        curve="convex"
        // Aire verde bajo los botones: la curva pegada a la fila dejaba la cabecera apretada y la
        // tarjeta de la foto sin verde sobre el que montarse. Es EL número a mover si el diseño
        // pide más o menos cabecera.
        belowRow={HEADER_BELOW_ROW}
        contentProgress={headerContent}
        // ⭐ Suben hasta SALIRSE por arriba: exactamente el sitio que ocupan (área segura + la
        // fila). Es lo que muestra el fotograma 3 de la referencia — título y botones cortados por
        // el borde superior. Clavados y sólo apagándose, la tarjeta subía ENTRE dos círculos verdes
        // que seguían ahí, y eso se lee como algo pegado encima de una cabecera que no se entera.
        contentLift={insets.top + HEADER_ROW}
        // El reloj que recibe YA es la ventana exacta del apagado (`HEADER_CONTENT_FADE`).
        // Recortarla otra vez dentro del header la dejaría a la mitad.
        contentFadeEnd={1}
      />

      {/* ⭐ El dueño del reloj envuelve el scroll Y la tarjeta de la foto, porque los dos entran en
          la MISMA cascada y viven en ramas distintas del árbol: la tarjeta tiene que cruzar el
          header y el resto del contenido tiene que pasar por debajo. Un reloj por rama serían dos
          animaciones que arrancan a la vez y se leen como una sola mal hecha. */}
      <ProductEntrance
        key={entranceKeyOf(product?.canonical_product_id, slug ?? "", visit)}
        screenMountedAt={screenMountedAt}
      >
        {(cascade) => (
          <>
      {/* La BASE de la pila: todo lo demás se mide contra esto. Va explícito y no implícito porque
          el defecto del velo nació justo de una capa que nadie había situado. Ver `layers.ts`. */}
      <Animated.View className="flex-1" style={[{ zIndex: LAYER.content }, hostStyle]}>
      <Animated.ScrollView
        ref={scrollRef}
        // ⭐ EL IMÁN LO HACE LA PLATAFORMA. iOS calcula el destino proyectado del gesto —velocidad
        // incluida— y lo ajusta DENTRO del mismo gesto, antes de decelerar, así que al soltar el
        // bloque del título queda posado bajo la cabecera compacta en vez de a medio camino. Ver
        // `snapOffsetsFor`: NUNCA reimplementarlo con `scrollTo` en `onEndDrag`.
        snapToOffsets={snapOffsets}
        // ⚠️ Sin esto, bajar a «Otras tiendas» te devolvería de un tirón al final del plegado: por
        // defecto el scroll imanta también al ÚLTIMO punto. Más allá del plegado, libre.
        snapToEnd={false}
        className="flex-1"
        onScroll={onScroll}
        scrollEventThrottle={16}
        // El pie flota (`position: absolute`), así que el scroll tiene que reservarle sitio o su
        // última sección queda debajo — el mismo motivo por el que la barra de tabs necesita su
        // propio clearance en las demás pantallas.
        contentContainerStyle={contentPadding}
        showsVerticalScrollIndicator={false}
      >
        {state === "content" && product ? (
          // ⭐ La `key` es lo que hace que la entrada se REPITA al saltar de un producto a otro.
          // Sin ella la pantalla no se desmonta —`openProduct` hace `replace` sobre la misma ruta—
          // y el contenido del producto nuevo aparecía de golpe, sin animar. Ver `entranceKeyOf`:
          // la identidad sale de los DATOS, nunca del slug de la ruta.
          <>
                <ProductSummary
                  cascade={cascade}
                  productId={product.canonical_product_id}
                  name={product.name}
                  brand={product.brand}
                  displaySize={product.display_size}
                  imageUrl={product.image_url}
                  // El precio grande es el MÍNIMO entre tiendas, que es la respuesta del comparador a
                  // «cuánto cuesta esto». Sale de la fila más barata, no de un campo aparte, para que no
                  // pueda discrepar del panel de tiendas.
                  priceMinor={best?.price_minor ?? 0}
                  currency={best?.row.currency ?? product.currency}
                  // El precio por unidad NO está en el panel de tiendas: vive en las entradas de la
                  // COMPARACIÓN. Se busca la de la tienda más barata para que el unitario grande y
                  // el precio grande hablen siempre de la misma tienda — con dos fuentes acabarían
                  // describiendo envases distintos.
                  //
                  // ⭐ El par de DISPLAY, no `unit_price_minor`. Aquél va siempre por kg/L/und
                  // porque es la clave de ORDEN, y como texto es ajena: una lata de 900 Gr no se
                  // compra por kilos. Esta pantalla decía «RD$227.78 X kg» donde la tarjeta decía
                  // «RD$22.78 X 100 Gr» — el mismo producto con dos cifras. Ver `display_units.py`.
                  unitPriceMinor={cheapestEntry?.display_unit_price_minor}
                  unitLabel={cheapestEntry?.display_unit}
                  previousMinor={best?.row.previous_price_minor}
                  skin={headerSkin}
                  // «Más información» BAJA hasta las secciones plegables en vez de abrir una hoja:
                  // el contenido ya está en la pantalla, y sacarlo a una capa encima obligaría a
                  // mantener dos sitios donde vive lo mismo. Animado, además, porque un salto seco
                  // deja al usuario sin saber si cambió de pantalla o se movió dentro de ésta.
                  onMoreInfo={() =>
                    scrollRef.current?.scrollTo({ y: sectionsY.current, animated: true })
                  }
                  // Sin canónico todavía no se pasa nada: el botón se apaga solo en vez de abrir una
                  // hoja que no sabría a qué producto añadir.
                  onAddToGroup={canonicalId ? () => setGroupsOpen(true) : undefined}
                  inGroup={inSomeGroup}
                  category={rootCategory}
                  // El MISMO destino que la ruleta de la home, para que la categoría signifique lo
                  // mismo se llegue por donde se llegue.
                  onOpenCategory={
                    rootCategory
                      ? () =>
                          router.push(
                            `/save/supermarket/browse?category=${rootCategory.slug}` as Href,
                          )
                      : undefined
                  }
                  history={historyPoints}
                  description={product.description}
                  photoSlot={photoSlot}
                />

                {/* Los dos ÚLTIMOS peldaños de la misma escalera. Estaban fuera de la cascada y se
                    pintaban a opacidad plena mientras el precio todavía entraba: la mitad de arriba de
                    la pantalla apareciendo y la de abajo ya puesta se lee como dos pantallas distintas.
                    Van aquí y no dentro de la cabecera porque sus datos son de esta pantalla, y
                    comparten el reloj porque una cascada con dos relojes no es una cascada. */}
                <CascadeItem progress={cascade} index={STEPS.StorePanel}>
                  <StorePanel
                    standings={standings}
                    onSeeAll={() => setChooserOpen(true)}
                    onSelect={openStore}
                  />
                </CascadeItem>

                {/* El historial va DESPUÉS de las tiendas, no antes: primero DÓNDE está más barato —que es
                    la decisión— y luego CÓMO ha evolucionado, que es el contexto que la respalda. Delante,
                    el chart pedía interpretar una curva antes de saber siquiera cuánto cuesta hoy. */}
                <CascadeItem progress={cascade} index={STEPS.History}>
                  <PriceHistoryChart history={history.data} gutter={20} />
                </CascadeItem>
          </>
        ) : (
          <Notice state={state} onRetry={() => void comparison.refetch()} onBack={() => router.back()} />
        )}

        {state === "content" && comparison.data ? (
          <View onLayout={(e) => (sectionsY.current = e.nativeEvent.layout.y)}>
          <ProductSections
            brand={comparison.data.brand}
            displaySize={comparison.data.display_size}
            quality={comparison.data.quality}
            breadcrumb={comparison.data.breadcrumb}
          />
          </View>
        ) : null}

        {/* Los rails sólo se dibujan si TRAEN algo. Un carrusel vacío con su título es peor que no
            estar: ocupa sitio y promete contenido que no hay. */}
        {state === "content" && (similar.data?.length ?? 0) > 0 ? (
          <View className="pt-6">
            <ProductRail
              title={t("save.product.similar.title")}
              subtitle={t("save.product.similar.subtitle")}
              products={similar.data ?? []}
              gutter={20}
              onSelect={openProduct}
              seeAllStyle="link"
              seeAllLabel={t("save.product.seeMore")}
              onSeeAll={
                categorySlug
                  ? () => router.push(`/save/supermarket/browse?category=${categorySlug}` as Href)
                  : undefined
              }
            />
          </View>
        ) : null}

        {state === "content" && (brand.data?.length ?? 0) > 0 && comparison.data?.brand ? (
          <View className="pt-6">
            <ProductRail
              title={t("save.product.brandRail.title").replace("{brand}", comparison.data.brand)}
              subtitle={t("save.product.brandRail.subtitle")}
              products={brand.data ?? []}
              gutter={20}
              onSelect={openProduct}
              seeAllStyle="link"
              seeAllLabel={t("save.product.seeMore")}
            />
          </View>
        ) : null}
      </Animated.ScrollView>

      </Animated.View>

      {/* ⭐ FUERA del scroll y con `zIndex` POR ENCIMA del header. Es la ÚNICA pieza que lo cruza:
          todo lo demás pasa por debajo de la elipse verde. Dentro del `ScrollView` esto era
          imposible —el header es hermano suyo y ningún z-index de un hijo le gana—, y subir el
          contenedor entero habría subido también el título y el precio. Ver `layers.ts`. */}
      {state === "content" && product ? (
        <>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              height: TOP_FADE_HEIGHT,
              // ⭐ ENTRE la lista y la cabecera: por encima del contenido que sube y por debajo del
              // verde y de la foto. Así el verde tapa el tramo de banda que le corresponde y el
              // desenfoque SIGUE A LA CURVA solo, sin dibujarla. La pila entera en `layers.ts`.
              zIndex: LAYER.topFade,
            },
            topFadeStyle,
          ]}
        >
          {/* El MISMO desvanecido del chat de AISpace y del hub de Ahorra, no una copia: un corte
              limpio dice «acá se acaba» y un difuminado dice «esto sigue». Reusarlo es lo que
              impide que los tres se separen al primer retoque. */}
          <TopScrollFade
            height={TOP_FADE_HEIGHT}
            isDark={isDark}
            // El lavado tiene que ser el fondo REAL de esta pantalla. Con el blanco por defecto se
            // vería una nube clara sobre el gris de Supermarket.
            //
            // Antes preguntaba el color del gradiente A LA ALTURA del header; con el fondo de Save
            // plano ya no hay altura que consultar.
            color={saveBgFor(isDark)}
          />
        </Animated.View>

        {/* ⭐⭐ **SIN ventana de recorte.** La tarjeta sale por el borde FÍSICO de la pantalla,
            como cualquier cosa que se scrollea, conservando sus esquinas redondas hasta el final.

            Se recortó dos veces contra un canto inventado —bajo la fila de botones, y luego en el
            canto de la cabecera compacta— y las dos se rechazaron por lo mismo: la tarjeta aparecía
            AMPUTADA, con el canto superior recto. Un recorte que el usuario ve es un defecto,
            aunque la geometría cuadre.

            ⭐ Va con `zIndex` POR ENCIMA del header y de la banda de desenfoque, y es la
            ÚNICA pieza que cruza el verde. Los controles del header no estorban porque para cuando
            la tarjeta llega, ya se han ido hacia arriba — ver `HEADER_CONTENT_FADE`. */}
        <HeroPhotoCard
          images={images}
          width={photoWidth}
          height={photoHeight}
          // En coordenadas de PANTALLA. Es el mismo `photoTop` del que sale el hueco reservado en
          // el flujo — si los dos discrepan, el nombre acaba leyéndose bajo la foto.
          top={photoTop}
          scrollY={scrollY}
          distance={collapseDist}
          headerShrink={headerShrink}
          cascade={cascade}
        />
        </>
      ) : null}
          </>
        )}
      </ProductEntrance>

      {/* El tirador de volver arriba, posado en el canto de la elipse. Aparece sólo cuando ya has
          bajado — arriba del todo sería un botón que no hace nada. */}
      {state === "content" ? (
        <BackToTopHandle
          scrollY={scrollY}
          ink={headerSkin.ink}
          distance={collapseDist}
          // Los dos cantos de la elipse: desplegada y compacta. `CurvedHeader` encoge hasta el
          // área segura más un dedo de verde (`safeTop + 6`), y la panza cuelga siempre por debajo.
          expandedTop={insets.top + HEADER_ROW + HEADER_BELOW_ROW + HEADER_BULGE - INDICATOR_INSET}
          collapsedTop={insets.top + 6 + HEADER_BULGE - INDICATOR_INSET}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        />
      ) : null}

      {/* ⚠️ FUERA del contenedor que escala con la hoja, y no es una preferencia de maquetación:
          iOS rasteriza el vidrio nativo y estirar ese mapa de bits satura el tinte y granula la
          textura durante toda la animación. Trasladar es seguro; escalar no. */}
      {state === "content" ? (
        <ProductFooter
          quantity={quantity}
          onQuantityChange={setQuantity}
          // MOCK: la lista de compras es lo último que se construye (ver product-placeholders).
          onAdd={() => {}}
          safeBottom={insets.bottom}
          hideProgress={footerHidden}
          skin={headerSkin}
        />
      ) : null}

      <ChooseStoreSheet
        open={chooserOpen}
        standings={standings}
        onRequestClose={() => setChooserOpen(false)}
        onSelect={(s) => {
          // Cerrar PRIMERO y abrir después: el navegador tapa la app, y volver de él a una hoja que
          // todavía se está yendo se lee como que la app se quedó a medias.
          setChooserOpen(false);
          openStore(s);
        }}
        safeBottom={insets.bottom}
        sheetStyle={sheetStyle}
        veilStyle={veilStyle}
        onSheetLayout={onSheetLayout}
      />

      <ChooseGroupSheet
        open={groupsOpen}
        groups={groups.data ?? []}
        loading={groups.isLoading}
        // La hoja mira `contains` y avisa; quién entra y quién sale se decide aquí, que es donde
        // viven las mutaciones.
        onToggle={(g) => {
          if (!canonicalId) return;
          const vars = { groupId: g.id, productId: canonicalId };
          if (g.contains) removeFromGroup.mutate(vars);
          else addToGroup.mutate(vars);
        }}
        onCreate={(name) => {
          if (!canonicalId) return;
          // Crear y meter el producto es UNA llamada (`CreateProductGroup` lo hace en la misma
          // transacción): en dos, un fallo en la segunda deja una carpeta vacía que nadie pidió.
          createGroup.mutate({ name, productId: canonicalId });
        }}
        duplicate={createGroup.isError}
        onRequestClose={() => setGroupsOpen(false)}
        safeBottom={insets.bottom}
        sheetStyle={groupMotion.sheetStyle}
        veilStyle={groupMotion.veilStyle}
        onSheetLayout={groupMotion.onSheetLayout}
      />
    </View>
  );
}

/**
 * Los tres estados que NO son contenido, cada uno con su salida.
 *
 * `notFound` no ofrece «reintentar» a propósito: un producto que no existe no va a aparecer por
 * mucho que se insista, y ese botón mandaría al usuario a un bucle. Su salida es volver.
 */
const NOTICE_COPY = {
  error: { title: "save.product.error.title", body: "save.product.error.body" },
  notFound: { title: "save.product.notFound.title", body: "save.product.notFound.body" },
  empty: { title: "save.product.empty.title", body: "save.product.empty.body" },
} as const;

function Notice({
  state,
  onRetry,
  onBack,
}: {
  state: ProductState;
  onRetry: () => void;
  onBack: () => void;
}) {
  // `loading` no dibuja nada todavía: el esqueleto llega con la pantalla real (fase 2). `content`
  // no llega nunca acá, pero el tipo lo admite y devolver null es más honesto que un cast.
  if (state === "loading" || state === "content") return null;

  const copy = NOTICE_COPY[state];

  return (
    <View className="items-center px-8 pt-16" style={{ gap: 10 }}>
      <Text
        className="text-center text-text dark:text-text-dark"
        style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 18 }}
      >
        {t(copy.title)}
      </Text>
      <Text
        className="text-center text-muted dark:text-muted-dark"
        style={{ fontFamily: KANTUMRUY_MEDIUM }}
      >
        {t(copy.body)}
      </Text>
      {state === "error" ? (
        <PillButton label={t("save.product.error.retry")} onPress={onRetry} />
      ) : state === "notFound" ? (
        <PillButton label={t("save.product.notFound.action")} onPress={onBack} />
      ) : null}
    </View>
  );
}
