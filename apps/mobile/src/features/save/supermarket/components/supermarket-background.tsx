// El fondo de Supermarket ES el de Save: se promovió a `features/save/save-background.tsx` cuando
// el hub y las alertas pasaron a compartirlo. Este módulo se queda como puerta de entrada para las
// pantallas de la vertical, que ya lo importaban con este nombre.
//
// ⚠️ `BG_LIGHT` sobrevive porque varias pantallas lo piden suelto (bandas y desvanecidos). Es el
// MISMO valor que `SAVE_BG_LIGHT`, reexportado — no una segunda copia: el hub llegó a tener su
// propio `#F4F4F4` escrito a mano, que es exactamente cómo dos fondos empiezan a separarse.
export {
  SAVE_BG_DARK as BG_DARK,
  SAVE_BG_LIGHT as BG_LIGHT,
  SaveBackground as SupermarketBackground,
  saveBgFor,
} from "../../save-background";
