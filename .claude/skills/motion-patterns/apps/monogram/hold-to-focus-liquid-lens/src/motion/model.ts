/** Translation estimates, not measured spring constants. */
export const LENS_TIMING = { enterMs: 250, withdrawMs: 350, dimMs: 180 } as const;

export function lensUniforms(
  width: number,
  height: number,
  progress: number,
  pulse: number,
  reducedMotion: boolean,
) {
  'worklet';
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('The lens requires a finite, positive viewport.');
  }
  const p = reducedMotion || !Number.isFinite(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const modulation = Number.isFinite(pulse) ? Math.max(0, Math.min(1, pulse)) : 0;
  return {
    size: [width, height],
    strength: p,
    boundary: height * (1.08 - 0.49 * p),
    bow: width * 0.04 * p,
    feather: height * 0.075,
    displacement: width * 0.04 * p * (1 + 0.2 * modulation),
    blurRadius: width * 0.018 * p,
    veil: 0.48 * p,
  };
}
