// Balanced role rotation: across a session everyone gets a fair turn on the killer's side.
import { accompliceCount } from '../shared/rules.ts';
import type { Rng } from './rng.ts';
import type { CaseRoles } from './caseGenerator.ts';

export type RoleHistory = Record<string, { killer: number; accomplice: number; patsy: number }>;

export function emptyHistory(playerIds: string[]): RoleHistory {
  return Object.fromEntries(playerIds.map((id) => [id, { killer: 0, accomplice: 0, patsy: 0 }]));
}

export function assignRoles(playerIds: string[], history: RoleHistory, rng: Rng): CaseRoles {
  const h = (id: string) => history[id] ?? { killer: 0, accomplice: 0, patsy: 0 };
  const lowest = (pool: string[], score: (id: string) => number) => {
    const min = Math.min(...pool.map(score));
    return rng.pick(pool.filter((id) => score(id) === min));
  };
  const killerId = lowest(playerIds, (id) => h(id).killer * 10 + h(id).accomplice);
  const accompliceIds: string[] = [];
  for (let i = 0; i < accompliceCount(playerIds.length); i++) {
    const pool = playerIds.filter((id) => id !== killerId && !accompliceIds.includes(id));
    accompliceIds.push(lowest(pool, (id) => h(id).killer + h(id).accomplice));
  }
  return { killerId, accompliceIds };
}

export function recordRoles(history: RoleHistory, roles: CaseRoles, patsyId: string): void {
  const bump = (id: string, key: 'killer' | 'accomplice' | 'patsy') => {
    history[id] ??= { killer: 0, accomplice: 0, patsy: 0 };
    history[id][key]++;
  };
  bump(roles.killerId, 'killer');
  roles.accompliceIds.forEach((id) => bump(id, 'accomplice'));
  bump(patsyId, 'patsy');
}
