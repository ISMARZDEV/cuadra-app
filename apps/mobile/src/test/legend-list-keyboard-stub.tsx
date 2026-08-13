/* eslint-disable @typescript-eslint/no-explicit-any */
import { LegendList } from "@legendapp/list/react-native";

// Stub de `@legendapp/list/keyboard`. Su build real importa `react-native-keyboard-controller` (un
// módulo NATIVO) y el bundle de reanimated por rutas internas, y ninguno de los dos sobrevive a
// jsdom.
//
// Clave: NO se reemplaza por un no-op. Se reexporta el `LegendList` normal, que es el MISMO
// componente sin la capa de teclado — así la lista sigue virtualizando y renderizando filas, y el
// test de `chat-screen` conserva su valor. Lo único que se pierde es lo que en jsdom no existe de
// todos modos: el teclado y el espacio de cola del anclaje (que depende de layout real).
export const KeyboardAwareLegendList = ({
  // Props que sólo entiende la variante de teclado: se descartan para que el LegendList normal no
  // reciba props desconocidas.
  anchoredEndSpace: _anchoredEndSpace,
  keyboardLiftBehavior: _keyboardLiftBehavior,
  applyWorkaroundForContentInsetHitTestBug: _workaround,
  contentInsetEndAdjustment: _inset,
  keyboardOffset: _offset,
  freeze: _freeze,
  ...props
}: any) => <LegendList {...props} />;

export const useKeyboardScrollToEnd = () => ({
  freeze: { value: false },
  // DEVUELVE UNA PROMESA, como la real (`keyboard.js:67` es un `async` que espera al scroll y al
  // dismiss del teclado). El call site encadena un `.then()` para volver a congelar, así que un
  // stub que devolviera `undefined` reventaba en cuanto un test llegaba a enviar un mensaje.
  scrollMessageToEnd: async () => {},
});

export const useKeyboardChatComposerInset = () => ({ contentInsetEndAdjustment: { value: 0 } });
