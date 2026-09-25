import { describe, expect, it } from 'vitest';
import { generateCase, type GeneratedCase } from '../src/engine/caseGenerator.ts';
import { launchNight } from '../src/engine/packs/launchNight.ts';
import { assignRoles, emptyHistory } from '../src/engine/roles.ts';
import { createRng } from '../src/engine/rng.ts';
import { candidates, factsFor, subsets } from '../src/engine/solver.ts';
import { accompliceCount, forgeryCount } from '../src/shared/rules.ts';
import type { TraitDim, Traits } from '../src/shared/types.ts';

const SEEDS = Number(process.env.GEN_SEEDS ?? 120);

function make(n: number, seed: number): GeneratedCase {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const roles = assignRoles(ids, emptyHistory(ids), createRng(seed));
  return generateCase({ pack: launchNight, playerIds: ids, roles, seed: seed * 31 + n });
}

function traitsOf(c: GeneratedCase): Record<string, Traits> {
  return Object.fromEntries(c.playerIds.map((id) => [id, c.cards[id].traits]));
}

function genuineKillerDims(c: GeneratedCase, noteIds: string[]): TraitDim[] {
  return noteIds.flatMap((id) => {
    const note = c.notes[id];
    return note.fact.kind === 'killer' && !note.forged ? [note.fact.dim] : [];
  });
}

describe('case generator', () => {
  it('is deterministic for a seed', () => {
    const a = make(8, 42);
    const b = make(8, 42);
    expect(a.killerId).toBe(b.killerId);
    expect(Object.keys(a.notes)).toEqual(Object.keys(b.notes));
  });

  for (let n = 4; n <= 22; n++) {
    it(`satisfies every constraint with ${n} players`, () => {
      for (let s = 0; s < SEEDS; s++) {
        const c = make(n, s);
        const traits = traitsOf(c);
        const k = traits[c.killerId];
        const innocents = c.playerIds.filter((id) => id !== c.killerId && !c.accompliceIds.includes(id));

        expect(c.accompliceIds).toHaveLength(accompliceCount(n));
        expect(c.forgedDims).toHaveLength(forgeryCount(n));
        expect(innocents).toContain(c.patsyId);

        // Full evidence identifies only the killer.
        expect(candidates(traits, factsFor(k, c.evidenceDims))).toEqual([c.killerId]);
        // No single trait or pair of traits identifies the killer.
        for (const dims of [...subsets(c.evidenceDims, 1), ...subsets(c.evidenceDims, 2)]) {
          expect(candidates(traits, factsFor(k, dims)).length).toBeGreaterThanOrEqual(2);
        }
        // Announcements alone never solve it.
        expect(candidates(traits, factsFor(k, c.announceDims)).length).toBeGreaterThanOrEqual(2);

        // Forgeries: true of the Patsy, false of the killer, held by the killer's side.
        const forged = Object.values(c.notes).filter((note) => note.forged);
        expect(forged).toHaveLength(forgeryCount(n));
        for (const f of forged) {
          if (f.fact.kind !== 'killer') throw new Error('forgery must look like killer evidence');
          expect(traits[c.patsyId][f.fact.dim]).toBe(f.fact.value);
          expect(k[f.fact.dim]).not.toBe(f.fact.value);
        }
        const killerSide = [c.killerId, ...c.accompliceIds];
        for (const id of innocents) {
          for (const nid of [...c.deal.evidence[id], ...c.deal.evidence2[id]]) expect(c.notes[nid].forged).toBe(false);
        }
        expect(killerSide.flatMap((id) => c.deal.evidence[id]).filter((nid) => c.notes[nid].forged)).toHaveLength(
          forgeryCount(n),
        );

        // No two starting hands (plus the first announcement) solve the case.
        for (const [a, b] of subsets(innocents, 2)) {
          const dims = new Set<TraitDim>([
            c.announceDims[0],
            ...genuineKillerDims(c, c.deal.evidence[a]),
            ...genuineKillerDims(c, c.deal.evidence[b]),
          ]);
          expect(candidates(traits, factsFor(k, dims)).length).toBeGreaterThanOrEqual(2);
        }

        // Everything dealt in the case (without forgeries) solves it.
        const allGenuine = innocents.flatMap((id) => genuineKillerDims(c, [...c.deal.evidence[id], ...c.deal.evidence2[id]]));
        const dims = new Set<TraitDim>([...c.announceDims, ...allGenuine]);
        expect(candidates(traits, factsFor(k, dims), [c.patsyId])).toEqual([c.killerId]);

        // The Patsy has a way out, held by someone else.
        const alibi = Object.values(c.notes).find((note) => note.fact.kind === 'alibi')!;
        const alibiHolder = c.playerIds.find((id) => c.deal.evidence2[id].includes(alibi.id));
        expect(alibiHolder).toBeDefined();
        expect(alibiHolder).not.toBe(c.patsyId);

        // Killer and Patsy have no witnesses at 21:30; nobody else is at their spots.
        expect(c.cards[c.killerId].witnesses).toEqual([]);
        expect(c.cards[c.patsyId].witnesses).toEqual([]);
        expect(c.playerIds.filter((id) => c.cards[id].location === c.cards[c.killerId].location)).toEqual([c.killerId]);

        // Lie options never include the truth.
        for (const id of c.playerIds) {
          for (const [dim, opts] of Object.entries(c.lieOptions[id])) {
            const truth = dim === 'location' ? c.cards[id].location : c.cards[id].traits[dim as TraitDim];
            expect(opts).not.toContain(truth);
            expect(opts.length).toBeGreaterThanOrEqual(2);
          }
        }

        // Tip-off names only innocents who really hold genuine evidence of that trait.
        for (const t of c.tipOff) {
          expect(innocents).toContain(t.playerId);
          expect(genuineKillerDims(c, c.deal.evidence[t.playerId])).toContain(t.dim);
        }
        if (c.accompliceIds.length === 0) expect(c.tipOff).toEqual([]);

        // Note text never names the killer directly in killer-evidence notes.
        for (const note of Object.values(c.notes)) {
          if (note.fact.kind === 'killer') expect(note.text).not.toContain(c.cards[c.killerId].name);
        }
      }
    });
  }
});
