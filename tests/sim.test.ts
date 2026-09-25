import { describe, expect, it } from 'vitest';
import { simulateGame } from '../scripts/sim.ts';

describe('headless simulator', () => {
  for (const n of [4, 9, 22]) {
    it(`plays a full all-bot game with ${n} players without getting stuck`, () => {
      const { state, stuck } = simulateGame(n, n * 17, 'normal', 2);
      expect(stuck).toBe(false);
      expect(state.phase).toBe('over');
      expect(state.results).toHaveLength(2);
      for (const r of state.results) {
        expect(Object.keys(r.scores)).toHaveLength(n);
        // Bots actually play: accusations are made and notes move.
        expect(Object.values(r.accusations).filter(Boolean).length).toBeGreaterThan(n / 2);
      }
    });
  }
});
