import { ArrowLeft, ShoppingBasket } from "lucide-react-native";
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { PillButton } from "@/components/ui/pill-button";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import {
  useBrandProducts,
  usePriceHistory,
  useProductComparison,
  useProductStores,
  useSimilarProducts,
  useSubscribeAlert,
} from "../../api";
import { nextHiddenState } from "@/components/navigation/hide-on-scroll";
import { NAV_HIDE_TIMING } from "@/components/navigation/nav-hide-motion";
import { useNavVisibility } from "@/components/navigation/use-nav-visibility";
import { useNavHideStore } from "@/store/nav-hide-store";

import { useCompareCount } from "../../compare-basket";
import { CurvedHeader } from "../components/curved-header";
import { ChooseStoreSheet } from "./components/choose-store-sheet";
import { FOOTER_CLEARANCE, ProductFooter } from "./components/product-footer";
import { PriceHistoryChart } from "./components/price-history-chart";
import { ProductSections } from "./components/product-sections";
import { CascadeItem } from "@/components/ui/cascade-item";
import { ProductEntrance, useEntranceVisit } from "./components/product-entrance";
import { ProductSummary } from "./components/product-summary";
import { entranceKeyOf, STEPS } from "./motion/entrance";
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
export function ProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const subscribe = useSubscribeAlert();
  // Arranca en 0: la cantidad dice cuántos has añadido a la lista, y al abrir el detalle no has
  // añadido ninguno. Un 1 de salida afirma algo que el usuario no hizo.
  const [quantity, setQuantity] = useState(0);
  const [following, setFollowing] = useState(false);
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

  // La cabecera todavía no colapsa (llega en la fase del scroll). Un valor fijo la deja desplegada
  // sin fingir un gesto que aún no existe.
  const collapse = useSharedValue(0);

  // El pie se va y vuelve con el scroll, EXACTAMENTE como la barra de tabs: mismo disparador
  // (arrastrar hacia abajo), mismo viaje y —lo importante— el mismo `NAV_HIDE_TIMING`. Si cada
  // barra pusiera el suyo, el mismo gesto se sentiría distinto según qué pantalla estuviera abierta.
  // ⭐ Arranca FUERA (1) y sube al entrar: la barra ENTRA en la pantalla igual que la de inicio,
  // en vez de aparecer ya puesta. Aparecer de golpe la delata como una capa pegada encima; subir
  // dice que pertenece a esta pantalla y que llegó con ella.
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
  // Cuándo montó LA PANTALLA. De aquí sale cuánto falta para que termine de deslizarse hacia
  // dentro, que es cuando la cascada puede arrancar sin gastarse en un sitio donde no se ve.
  // Inicializador PEREZOSO: con `useRef(Date.now())` la fecha se recalcularía en cada render.
  const [screenMountedAt] = useState(() => Date.now());

  // Un solo cálculo para el precio grande, los avatares y (en la fase 3) la tabla y sus tiles:
  // derivarlos por separado es cómo el panel del admin acabó con tres números que no cerraban.
  const standings = storeStandings(stores.data ?? []);
  const best = standings[0];

  // La página se atenúa y RETROCEDE mientras la hoja está arriba; no se desmonta. Recuperarla
  // exactamente donde se dejó es el argumento entero del regreso lento del patrón.
  const { hostStyle, sheetStyle, veilStyle, onSheetLayout } = useDeliberateSheet(chooserOpen);

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
      <AppBackground />

      <CurvedHeader
        title={t("save.product.title")}
        progress={collapse}
        safeTop={insets.top}
        backIcon={ArrowLeft}
        backLabel={t("save.product.back")}
        onBack={() => router.back()}
        basketIcon={ShoppingBasket}
        basketLabel={t("save.supermarket.compare")}
        basketCount={compareCount}
        // La elipse va INVERTIDA aquí: el blanco sube por el centro y el verde baja en los lados,
        // así la hoja de abajo se lee como una superficie que asciende hacia la foto.
        curve="concave"
      />

      <Animated.View className="flex-1" style={hostStyle}>
      <Animated.ScrollView
        className="flex-1"
        onScroll={onScroll}
        scrollEventThrottle={16}
        // El pie flota (`position: absolute`), así que el scroll tiene que reservarle sitio o su
        // última sección queda debajo — el mismo motivo por el que la barra de tabs necesita su
        // propio clearance en las demás pantallas.
        contentContainerStyle={{
          // ⭐ SIN colchón para la panza. Con la curva CÓNCAVA el verde baja en los LADOS y el
          // blanco sube por el CENTRO, así que el contenido centrado —el tirador y la foto— tiene
          // sitio libre ahí arriba. El colchón de `HEADER_BULGE` era el correcto para la curva
          // convexa de la home, donde la panza cuelga justo por el medio; aquí sólo empujaba la
          // foto 28pt hacia abajo sin motivo.
          paddingTop: 0,
          paddingBottom: insets.bottom + FOOTER_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
      >
        {state === "content" && product ? (
          // ⭐ La `key` es lo que hace que la entrada se REPITA al saltar de un producto a otro.
          // Sin ella la pantalla no se desmonta —`openProduct` hace `replace` sobre la misma ruta—
          // y el contenido del producto nuevo aparecía de golpe, sin animar. Ver `entranceKeyOf`:
          // la identidad sale de los DATOS, nunca del slug de la ruta.
          <ProductEntrance
            key={entranceKeyOf(product.canonical_product_id, slug ?? "", visit)}
            screenMountedAt={screenMountedAt}
          >
            {(cascade) => (
              <>
                <ProductSummary
                  cascade={cascade}
                  name={product.name}
                  brand={product.brand}
                  displaySize={product.display_size}
                  imageUrl={product.image_url}
                  // El precio grande es el MÍNIMO entre tiendas, que es la respuesta del comparador a
                  // «cuánto cuesta esto». Sale de la fila más barata, no de un campo aparte, para que no
                  // pueda discrepar del panel de tiendas.
                  priceMinor={best?.price_minor ?? 0}
                  currency={best?.row.currency ?? product.currency}
                  priceType={best?.row.price_type}
                  seenAt={best?.row.last_seen_at}
                  stores={standings.map((s2) => ({
                    name: s2.row.provider_name,
                    logoUrl: s2.row.provider_logo_url,
                  }))}
                  description={product.description}
                  following={following}
                  onToggleFollow={() => {
                    setFollowing((v) => !v);
                    if (!following) {
                      subscribe.mutate({ productId: product.canonical_product_id });
                    }
                  }}
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
            )}
          </ProductEntrance>
        ) : (
          <Notice state={state} onRetry={() => void comparison.refetch()} onBack={() => router.back()} />
        )}

        {state === "content" && comparison.data ? (
          <ProductSections
            brand={comparison.data.brand}
            displaySize={comparison.data.display_size}
            quality={comparison.data.quality}
            breadcrumb={comparison.data.breadcrumb}
          />
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
