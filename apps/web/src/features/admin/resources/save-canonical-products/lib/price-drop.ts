/**
 * Bajada de precio contra la observación anterior.
 *
 * `previousMinor` viene del backend como el último precio DISTINTO al vigente (derivado de
 * `save.price`, que es append-only). Acá sólo se decide cómo contarlo.
 */

/** Piso a partir del cual la bajada se destaca con el círculo. Decisión de producto. */
export const DISCOUNT_FLOOR = 0.1;

export interface PriceDrop {
  /** Porcentaje ENTERO de la bajada, ya redondeado para pantalla. */
  percent: number;
  /** `true` cuando alcanza el piso: recién ahí la UI pinta el círculo del descuento. */
  significant: boolean;
}

/**
 * Devuelve la bajada, o `null` cuando no hay ninguna que mostrar.
 *
 * `null` cubre tres casos que la UI trata igual (no tacha nada): sin precio anterior, el precio
 * subió, o no se movió. Distinguirlos en el tipo obligaría a cada llamador a repetir el mismo
 * `if`, y el único que importa es "¿hay algo que tachar?".
 *
 * El porcentaje se mide contra el precio ANTERIOR, que es la base de cualquier descuento:
 * medirlo contra el nuevo infla la cifra (2100 sobre 7400 da 28%, no 22%).
 */
export function priceDrop(
  currentMinor: number,
  previousMinor: number | null | undefined,
): PriceDrop | null {
  // El `<= 0` no es defensivo de más: un anterior en cero haría que la división diera Infinity
  // y la pantalla mostrara "-Infinity%".
  if (previousMinor === null || previousMinor === undefined || previousMinor <= 0) return null;
  if (previousMinor <= currentMinor) return null;

  const ratio = (previousMinor - currentMinor) / previousMinor;
  return { percent: Math.round(ratio * 100), significant: ratio >= DISCOUNT_FLOOR };
}
