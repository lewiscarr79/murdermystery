// Decisions for the killer's side: lie where it's dangerous, spread forgeries, hide real evidence.
import type { Action } from '../../shared/types.ts';
import type { CaseView } from '../../shared/view.ts';
import type { Rng } from '../../engine/rng.ts';
import type { Memory } from './knowledge.ts';

/** Notes that must never leave the killer's side: genuine evidence of the killer's traits. */
function isIncriminating(cv: CaseView, mem: Memory, noteId: string): boolean {
  const n = [...cv.hand, ...cv.seen].find((x) => x.id === noteId);
  if (!n || n.fact.kind !== 'killer') return false;
  if (mem.dealt.has(noteId)) return false; // our own forgeries
  if (cv.role === 'killer') return cv.card.traits[n.fact.dim] === n.fact.value;
  return true; // accomplices can't tell which are genuine, so they sit on all of them
}

function forgeries(cv: CaseView, mem: Memory) {
  return cv.hand.filter((n) => n.fact.kind === 'killer' && mem.dealt.has(n.id));
}

export function killerAnswer(cv: CaseView, mem: Memory, rng: Rng): Action | null {
  const q = cv.incoming[0];
  if (!q) return null;
  const dangerous = cv.role === 'killer' && q.dim !== 'location' && cv.killerBriefing!.dangerousDims.includes(q.dim);
  if (!dangerous) return { type: 'answer', questionId: q.id, mode: 'truth' };
  if (cv.liesLeft <= 0) return { type: 'answer', questionId: q.id, mode: 'nocomment' };
  const forgedValues = new Set(forgeries(cv, mem).flatMap((n) => (n.fact.kind === 'killer' && n.fact.dim === q.dim ? [n.fact.value] : [])));
  const previous = mem.toldValue.get(q.dim);
  const options = cv.lieOptions[q.dim].filter((v) => !forgedValues.has(v));
  const value = previous && cv.lieOptions[q.dim].includes(previous) ? previous : rng.pick(options.length ? options : cv.lieOptions[q.dim]);
  mem.toldValue.set(q.dim, value);
  return { type: 'answer', questionId: q.id, mode: 'lie', lieValue: value };
}

export function killerTrade(cv: CaseView, mem: Memory, rng: Rng, me: string): Action | null {
  const briefing = cv.killerBriefing!;
  const side = new Set([briefing.killerId, ...briefing.accompliceIds]);

  const req = cv.swaps.find((s) => s.status === 'pending' && !s.iAmRequester);
  if (req) return { type: 'respondSwap', swapId: req.id, accept: true };

  const picking = cv.swaps.find((s) => s.status === 'picking' && !s.myPick);
  if (picking) {
    const free = cv.hand.filter((n) => !cv.lockedNoteIds.includes(n.id));
    const partnerIsSide = picking.members.every((m) => side.has(m));
    const forged = free.filter((n) => forgeries(cv, mem).some((f) => f.id === n.id));
    const safe = free.filter((n) => !isIncriminating(cv, mem, n.id));
    const pick = (!partnerIsSide && forged.length ? forged[0] : null) ?? safe.find((n) => !forged.includes(n)) ?? safe[0] ?? free[0];
    return pick ? { type: 'pickSwap', swapId: picking.id, noteId: pick.id } : null;
  }
  const give = cv.gives.find((g) => g.toId === me);
  if (give) return { type: 'respondGive', giveId: give.id, accept: true };
  const alliance = cv.allianceRequests.find((a) => a.toId === me);
  if (alliance) return { type: 'respondAlliance', allianceId: alliance.id, accept: true };

  if (cv.swaps.some((s) => s.kind === 'forced' && s.status === 'picking')) return null;
  const busy = cv.swaps.some((s) => s.iAmRequester && s.status === 'pending') || cv.gives.some((g) => g.fromId === me);
  const innocents = Object.keys(cv.cast).filter((id) => !side.has(id) && id !== briefing.patsyId);
  const targets = briefing.tipOff.map((t) => t.playerId).filter((id) => !side.has(id));

  if (cv.alliancesEnabled && !mem.proposedAlliance && cv.allies.length === 0 && rng.chance(0.5)) {
    mem.proposedAlliance = true;
    const target = targets.length ? rng.pick(targets) : rng.pick(innocents);
    if (target) return { type: 'proposeAlliance', targetId: target };
  }
  const forged = forgeries(cv, mem).filter((n) => !cv.lockedNoteIds.includes(n.id));
  if (!busy && cv.left.requests > 0 && forged.length && rng.chance(0.5)) {
    const target = rng.pick([...cv.allies.filter((a) => !side.has(a)), ...innocents]);
    if (target) {
      mem.gaveForgery.add(target);
      return { type: 'give', targetId: target, noteId: forged[0].id };
    }
  }
  if (!busy && cv.left.requests > 0 && rng.chance(0.55)) {
    const target = targets.length && rng.chance(0.7) ? rng.pick(targets) : rng.pick(innocents);
    if (target) return { type: 'requestSwap', targetId: target };
  }
  if (cv.left.shows > 0 && forged.length && rng.chance(0.3)) {
    const target = rng.pick(innocents);
    if (target) return { type: 'show', targetId: target, noteId: forged[0].id };
  }
  return null;
}

export function killerStatement(cv: CaseView, mem: Memory, rng: Rng): Action | null {
  if (cv.left.statements <= 0 || !rng.chance(0.25)) return null;
  const b = cv.killerBriefing!;
  if (cv.statementOptions.suspectAllowed && !mem.statementsMade.has('suspect')) {
    mem.statementsMade.add('suspect');
    return { type: 'statement', statementType: 'suspect', targetId: b.patsyId };
  }
  if (cv.role === 'accomplice' && !mem.statementsMade.has('vouch') && rng.chance(0.4)) {
    mem.statementsMade.add('vouch');
    return { type: 'statement', statementType: 'vouch', targetId: b.killerId };
  }
  return null;
}

export function killerAccuse(cv: CaseView, rng: Rng): Action | null {
  if (cv.accusation) return null;
  const b = cv.killerBriefing!;
  const target = rng.chance(0.8) ? b.patsyId : rng.pick(Object.keys(cv.cast).filter((id) => id !== b.killerId && !b.accompliceIds.includes(id)));
  return { type: 'accuse', targetId: target, stake: 'hunch' };
}
