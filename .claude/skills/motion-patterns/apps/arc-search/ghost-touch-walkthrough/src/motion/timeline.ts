import { Extrapolation, interpolate } from 'react-native-reanimated';

export type Keyframe = {
  /** Milliseconds from the start of the timeline. */
  at: number;
  value: number;
};

/**
 * A track is a keyframe list flattened into two parallel arrays, built ONCE on the JS side so the
 * worklet never allocates per frame.
 */
export type Track = { times: number[]; values: number[] };

export function track(frames: Keyframe[]): Track {
  const sorted = [...frames].sort((a, b) => a.at - b.at);
  return { times: sorted.map((f) => f.at), values: sorted.map((f) => f.value) };
}

/** Read a track at the current clock position. Clamped at both ends. */
export function valueAt(clockMs: number, t: Track): number {
  'worklet';
  if (t.times.length === 0) return 0;
  if (t.times.length === 1) return t.values[0]!;
  return interpolate(clockMs, t.times, t.values, Extrapolation.CLAMP);
}

/** Total duration of a set of tracks — the timeline runs as long as its longest actor. */
export function durationOf(...tracks: Track[]): number {
  return tracks.reduce((max, t) => Math.max(max, t.times[t.times.length - 1] ?? 0), 0);
}
