// Decisions for innocent players (detectives, including an unknowing Patsy).
import { TRAIT_DIMS, type Action, type QuestionDim } from '../../shared/types.ts';
import type { CaseView, PlayerView } from '../../shared/view.ts';
import type { Rng } from '../../engine/rng.ts';
import type { Deductions, Memory } from './knowledge.ts';
import type { BotLevel } from '../../shared/types.ts';

export const LEVEL = {
  easy: { noise: 1.6, sureGap: 99, askFocus: 0.4, fearLie: 0.15 },
  normal: { noise: 0.6, sureGap: 2.2, askFocus: 0.75, fearLie: 0.3 },
  sharp: { noise: 0.15, sureGap: 1.6, askFocus: 0.95, fearLie: 0.4 },
} satisfies Record<BotLevel, unknown>;

export function detectiveAnswer(cv: CaseView, d: Deductions, rng: Rng, level: BotLevel): Action | null {
  const q = cv.incoming[0];
  if (!q) return null;
  const truth = q.dim === 'location' ? cv.card.location : cv.card.traits[q.dim];
  // Innocent players sometimes panic-lie when their truth matches the evidence.
  const matches = q.dim !== 'location' && d.facts.get(q.dim)?.value === truth;
  if (matches && cv.liesLeft > 0 && rng.chance(LEVEL[level].fearLie)) {
    return { type: 'answer', questionId: q.id, mode: 'lie', lieValue: rng.pick(cv.lieOptions[q.dim]) };
  }
  return { type: 'answer', questionId: q.id, mode: 'truth' };
}

export function chooseQuestion(view: PlayerView, cv: CaseView, d: Deductions, rng: Rng, level: BotLevel, me: string): Action | null {
  if (cv.left.questions <= 0) return null;
  const asked = new Set(cv.asked.map((q) => `${q.targetId}:${q.dim}`));
  const focus = rng.chance(LEVEL[level].askFocus);
  // Random tie-break so bots don't all pile onto the same players.
  const jittered = rng
    .shuffle(d.ranking)
    .map((id) => ({ id, s: d.scores.get(id)! + rng.next() * 0.3 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  const pool = (focus ? jittered.slice(0, 5) : rng.shuffle(d.ranking)).filter(
    (id) => id !== me && !cv.busy.includes(id) && !d.cleared.has(id),
  );
  for (const target of pool) {
    const factDims = [...d.facts.keys()].filter((dim) => !d.known.get(target)?.has(dim));
    const dims: QuestionDim[] = rng.shuffle([...factDims, ...(rng.chance(0.3) ? (['location'] as QuestionDim[]) : []), ...TRAIT_DIMS]);
    const dim = dims.find((x) => !asked.has(`${target}:${x}`));
    if (dim) return { type: 'ask', targetId: target, dim };
  }
  void view;
  return null;
}

export function detectiveTrade(view: PlayerView, cv: CaseView, d: Deductions, mem: Memory, rng: Rng, me: string): Action | null {
  // Respond to swap requests.
  const req = cv.swaps.find((s) => s.status === 'pending' && !s.iAmRequester);
  if (req) {
    const from = req.members[0];
    const trust = (d.forgerySuspects.get(from) ?? 0) > 0 || d.liars.has(from) ? 0.35 : 0.8;
    return { type: 'respondSwap', swapId: req.id, accept: rng.chance(trust) };
  }
  const picking = cv.swaps.find((s) => s.status === 'picking' && !s.myPick);
  if (picking) {
    const free = cv.hand.filter((n) => !cv.lockedNoteIds.includes(n.id));
    // Prefer handing over records; keep killer evidence a bit longer.
    const records = free.filter((n) => n.fact.kind !== 'killer');
    const pick = records.length && rng.chance(0.65) ? rng.pick(records) : free.length ? rng.pick(free) : null;
    return pick ? { type: 'pickSwap', swapId: picking.id, noteId: pick.id } : null;
  }
  const give = cv.gives.find((g) => g.toId === me);
  if (give) {
    const suspicious = (d.forgerySuspects.get(give.fromId) ?? 0) > 0 || d.liars.has(give.fromId);
    return { type: 'respondGive', giveId: give.id, accept: rng.chance(suspicious ? 0.3 : 0.75) };
  }
  const alliance = cv.allianceRequests.find((a) => a.toId === me);
  if (alliance) {
    const top = d.ranking.slice(0, 2).includes(alliance.fromId);
    return { type: 'respondAlliance', allianceId: alliance.id, accept: rng.chance(top ? 0.25 : 0.6) };
  }

  const busyWithRequest = cv.swaps.some((s) => s.iAmRequester && s.status === 'pending') || cv.gives.some((g) => g.fromId === me);
  const inForced = cv.swaps.some((s) => s.kind === 'forced' && s.status === 'picking');
  if (inForced) return null;


  if (!busyWithRequest && cv.left.requests > 0 && cv.hand.length && rng.chance(0.55)) {
    const pool = [...cv.allies, ...d.ranking.slice(2)].filter((id) => id !== me);
    if (pool.length) return { type: 'requestSwap', targetId: rng.pick(pool) };
  }
  if (cv.left.shows > 0 && cv.allies.length && cv.hand.length && rng.chance(0.5)) {
    const trusted = cv.hand.filter((n) => mem.dealt.has(n.id));
    const note = rng.pick(trusted.length ? trusted : cv.hand);
    return { type: 'show', targetId: rng.pick(cv.allies), noteId: note.id };
  }
  void view;
  return null;
}

export function detectiveStatement(cv: CaseView, d: Deductions, mem: Memory, rng: Rng): Action | null {
  if (cv.left.statements <= 0 || !rng.chance(0.25)) return null;
  const liar = [...d.liars].find((l) => !mem.statementsMade.has(`lied:${l}`));
  if (liar) {
    mem.statementsMade.add(`lied:${liar}`);
    return { type: 'statement', statementType: 'lied', targetId: liar };
  }
  const mate = cv.card.witnesses.find((w) => !mem.statementsMade.has(`vouch:${w}`));
  if (mate && rng.chance(0.5)) {
    mem.statementsMade.add(`vouch:${mate}`);
    return { type: 'statement', statementType: 'vouch', targetId: mate };
  }
  if (!mem.statementsMade.has('wasAt')) {
    mem.statementsMade.add('wasAt');
    return { type: 'statement', statementType: 'wasAt', value: cv.card.location };
  }
  return null;
}

export function detectiveMarks(cv: CaseView, d: Deductions): Action | null {
  const me = cv.card.playerId;
  for (const l of d.liars) if (l !== me && cv.marks[l] !== 'liar') return { type: 'mark', targetId: l, mark: 'liar' };
  for (const c of d.cleared) if (c !== me && !cv.marks[c]) return { type: 'mark', targetId: c, mark: 'cleared' };
  return null;
}

export function detectiveAccuse(cv: CaseView, d: Deductions, rng: Rng, level: BotLevel): Action | null {
  if (cv.accusation) return null;
  const noisy = d.ranking
    .map((id) => ({ id, s: d.scores.get(id)! + (rng.next() - 0.5) * 2 * LEVEL[level].noise }))
    .sort((a, b) => b.s - a.s);
  const [top, second] = noisy;
  if (!top) return null;
  const gap = top.s - (second?.s ?? 0);
  const sure = gap >= LEVEL[level].sureGap && d.facts.size >= 3;
  return { type: 'accuse', targetId: top.id, stake: sure ? 'sure' : 'hunch' };
}
