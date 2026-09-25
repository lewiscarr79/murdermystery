// Full-knowledge solver: which players match a set of killer-trait facts?
// Used by the generator (to enforce difficulty constraints), tests and the simulator.
import type { TraitDim, Traits } from '../shared/types.ts';

export function candidates(
  traits: Record<string, Traits>,
  facts: Partial<Record<TraitDim, string>>,
  excluded: Iterable<string> = [],
): string[] {
  const ex = new Set(excluded);
  return Object.keys(traits).filter(
    (id) => !ex.has(id) && Object.entries(facts).every(([d, v]) => traits[id][d as TraitDim] === v),
  );
}

export function factsFor(killerTraits: Traits, dims: Iterable<TraitDim>): Partial<Record<TraitDim, string>> {
  const out: Partial<Record<TraitDim, string>> = {};
  for (const d of dims) out[d] = killerTraits[d];
  return out;
}

export function subsets<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  return [...subsets(rest, size - 1).map((s) => [head, ...s]), ...subsets(rest, size)];
}
