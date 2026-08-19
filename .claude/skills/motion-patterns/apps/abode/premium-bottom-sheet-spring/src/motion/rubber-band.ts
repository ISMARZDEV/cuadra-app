// motion/rubber-band.ts
/** iOS-style resistance: the further you pull, the less it moves. */
export function rubberBand(value: number, dimension: number, coeff = 0.55): number {
  'worklet';
  if (dimension <= 0) return value;
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  return sign * (1 - 1 / ((x * coeff) / dimension + 1)) * dimension;
}
