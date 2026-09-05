import type { AlertDto } from "@cuadra/api-client";

/**
 * Si el usuario ya sigue este producto, el id de LA ALERTA. Si no, `null`.
 *
 * ⭐ Devuelve el id de la alerta y no un booleano porque es lo que hace falta para dejar de
 * seguirla: `unsubscribeAlert` recibe el `alert_id`. Con un booleano habría que volver a buscar la
 * alerta en el momento de borrarla, con la lista quizá ya cambiada bajo los pies.
 *
 * ⚠️ **Sin `canonicalProductId` no empareja NADA, y esa guarda no sobra.** El detalle tiene un
 * waterfall obligatorio —el producto se resuelve por slug y su id sólo se conoce cuando responde la
 * comparación (ver `api.ts`)—, así que hay una ventana real en la que el id todavía no existe
 * mientras la lista de alertas ya llegó. Comparando a pelo, un `undefined === undefined` daría por
 * seguida cualquier alerta mal formada y el botón aparecería encendido sobre un producto que el
 * usuario no sigue. En un producto de fintech, un control que miente sobre lo que has contratado
 * cuesta más que uno que tarda un instante en encenderse.
 */
export function followedAlertId(
  alerts: readonly AlertDto[] | undefined,
  canonicalProductId: string | undefined,
): string | null {
  if (!alerts || !canonicalProductId) return null;

  return alerts.find((a) => a.canonical_product_id === canonicalProductId)?.id ?? null;
}
