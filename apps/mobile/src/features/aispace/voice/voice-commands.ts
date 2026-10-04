/**
 * COMANDOS DE VOZ SOBRE EL DICTADO — «borra eso», «empieza de nuevo», «cancela».
 *
 * ⭐⭐ **El vocabulario es FIJO, y esa es la regla de oro del oficio.** Dragon, la dictación de
 * Office y la de Apple funcionan igual: lo que está en la lista se EJECUTA, lo que no, se ESCRIBE
 * literal. Intentar adivinar la intención con un modelo convertiría cada frase en una apuesta, y el
 * fallo sería silencioso y destructivo — borrar lo que el usuario quería decir.
 *
 * ⭐⭐⭐ **UN TRAMO SÓLO ES COMANDO SI ES *NADA MÁS* QUE EL COMANDO.** Es el discriminador que hace
 * esto usable: «borra eso» dicho solo es una orden; «le dije que borra eso del informe» es texto.
 * Sin esta regla, dictar sobre casi cualquier tema acabaría borrando frases al azar — y el usuario
 * no tendría forma de saber por qué.
 */

/** Qué hacer con lo dictado hasta ahora. */
export type VoiceCommand = "undo" | "clear" | "cancel" | null;

/**
 * Las frases, por idioma. Escritas ya normalizadas (minúsculas y sin tildes) para comparar directo.
 *
 * ⚠️ **«no» a secas NO está, y es deliberado.** Es la palabra más común del español y aparece dentro
 * de casi cualquier frase dictada; como comando destruiría texto constantemente. Cancelar se dice
 * con un verbo inequívoco.
 */
const PHRASES: Record<string, Record<Exclude<VoiceCommand, null>, string[]>> = {
  es: {
    undo: [
      "borra eso", "borralo", "borra lo ultimo", "elimina eso", "quita eso",
      "olvida eso", "olvidalo", "eso no", "no eso no",
    ],
    clear: [
      "borra todo", "borralo todo", "limpia todo", "empieza de nuevo",
      "empecemos de nuevo", "desde el principio", "de cero",
    ],
    cancel: ["cancela", "cancelar", "deja eso", "olvidalo todo"],
  },
  en: {
    undo: ["scratch that", "delete that", "undo that", "forget that", "remove that"],
    clear: ["clear all", "delete all", "start over", "start again", "from the top"],
    cancel: ["cancel", "cancel that", "never mind"],
  },
  pt: {
    undo: ["apaga isso", "apague isso", "esquece isso", "remove isso"],
    clear: ["apaga tudo", "limpa tudo", "comecar de novo", "do inicio"],
    cancel: ["cancela", "cancelar", "deixa isso"],
  },
};

/**
 * Deja un tramo comparable: minúsculas, sin tildes, sin puntuación y con un solo espacio.
 *
 * ⚠️ Hace falta las cuatro cosas. El reconocedor devuelve «Borra eso.» con mayúscula y punto, y
 * escribe «bórralo» con tilde; comparar en crudo fallaría en todos esos casos y el usuario vería
 * su comando convertido en texto sin entender por qué.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita las tildes ya descompuestas
    .toLowerCase()
    .replace(/[.,;:!¡?¿"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Este tramo es un comando?
 *
 * Devuelve `null` cuando es texto normal — que es el caso abrumadoramente mayoritario, y por eso la
 * comparación es exacta contra el vocabulario y no «contiene».
 */
export function detectCommand(segment: string, lang: string): VoiceCommand {
  const clean = normalize(segment);
  if (!clean) return null;
  const table = PHRASES[lang] ?? PHRASES.es;
  for (const kind of ["undo", "clear", "cancel"] as const) {
    if (table[kind].includes(clean)) return kind;
  }
  return null;
}

/**
 * Aplica el comando a los tramos ya dictados y devuelve la lista resultante.
 *
 * ⭐ Los tramos viven en una LISTA y no en una cadena, y esa decisión es lo que hace posible
 * «borra eso»: de un texto pegado no se puede quitar «lo último» sin adivinar dónde empezaba.
 */
export function applyCommand(segments: readonly string[], command: VoiceCommand): string[] {
  switch (command) {
    case "undo":
      return segments.slice(0, -1);
    case "clear":
    case "cancel":
      return [];
    default:
      return [...segments];
  }
}
