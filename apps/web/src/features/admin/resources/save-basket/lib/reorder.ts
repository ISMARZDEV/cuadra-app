import type { BasketQueryDto } from "@cuadra/api-client";

export interface PositionPatch {
  id: string;
  position: number;
}

// Mueve `from`→`to` en una copia del array (no muta).
function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * PURO: dado el orden natural (`entries`, ya ordenado por `position`) y un drag de `fromId` sobre
 * `toId`, devuelve SOLO los `{id, position}` que hay que persistir. Conserva el multiset de
 * `position` del rango afectado y lo reasigna en el nuevo orden (no renumera toda la canasta ni
 * inventa posiciones nuevas) — así un drag de un paso toca 2 filas, uno largo toca solo su rango.
 */
export function reorderPositions(
  entries: readonly BasketQueryDto[],
  fromId: string,
  toId: string,
): PositionPatch[] {
  const from = entries.findIndex((e) => e.id === fromId);
  const to = entries.findIndex((e) => e.id === toId);
  if (from < 0 || to < 0 || from === to) return [];

  const reordered = arrayMove(entries, from, to);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const positions = entries.slice(lo, hi + 1).map((e) => e.position);

  const patches: PositionPatch[] = [];
  for (let i = lo; i <= hi; i++) {
    const row = reordered[i];
    const position = positions[i - lo];
    if (row.position !== position) patches.push({ id: row.id, position });
  }
  return patches;
}
