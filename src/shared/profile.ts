// Player-side helpers that join the dots: what the clues say about the killer ("Wanted" profile),
// how each suspect matches it (✓ / ✗ / ?), what each note means, and a suggested next move.
// They read only the player's own CaseView, so they can never reveal anything hidden.
import { isQuestionRound, isTradingRound } from './rules.ts';
import { TRAIT_DIMS, type NoteView, type QuestionDim, type RoundId, type TraitDim } from './types.ts';
import type { CaseView } from './view.ts';

export const TRAIT_LABEL: Record<QuestionDim, string> = {
  coat: 'coat',
  arrival: 'way of arriving',
  location: 'whereabouts at 21:30',
  drink: 'drink',
  phone: 'phone',
  team: 'team',
};

export type ProfileStatus = 'confirmed' | 'likely' | 'conflict' | 'unknown';

export interface ProfileEntry {
  dim: TraitDim;
  status: ProfileStatus;
  /** Every value your evidence has claimed, strongest first. */
  values: { value: string; notes: number; confirmed: boolean }[];
  /** The value we'd bet on (undefined when unknown or in conflict without an announcement). */
  best?: string;
}

export function buildProfile(cv: CaseView): ProfileEntry[] {
  const byDim = new Map<TraitDim, Map<string, { notes: number; confirmed: boolean }>>();
  const add = (n: NoteView, confirmed: boolean) => {
    if (n.fact.kind !== 'killer') return;
    const m = byDim.get(n.fact.dim) ?? new Map();
    const e = m.get(n.fact.value) ?? { notes: 0, confirmed: false };
    e.notes += 1;
    e.confirmed ||= confirmed;
    m.set(n.fact.value, e);
    byDim.set(n.fact.dim, m);
  };
  cv.announcements.forEach((n) => add(n, true));
  const seenIds = new Set<string>();
  for (const n of [...cv.hand, ...cv.seen]) {
    if (seenIds.has(n.id)) continue;
    seenIds.add(n.id);
    add(n, false);
  }
  const entries = TRAIT_DIMS.map((dim): ProfileEntry => {
    const m = byDim.get(dim);
    if (!m) return { dim, status: 'unknown', values: [] };
    const values = [...m.entries()]
      .map(([value, e]) => ({ value, ...e }))
      .sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.notes - a.notes);
    const confirmed = values.find((v) => v.confirmed);
    if (confirmed) return { dim, status: 'confirmed', values, best: confirmed.value };
    if (values.length > 1) return { dim, status: 'conflict', values };
    return { dim, status: 'likely', values, best: values[0].value };
  });
  const rank: Record<ProfileStatus, number> = { confirmed: 0, likely: 1, conflict: 2, unknown: 3 };
  return entries.sort((a, b) => rank[a.status] - rank[b.status]);
}

export type TickMark = 'match' | 'mismatch' | 'unknown';

export interface Tick {
  dim: TraitDim;
  mark: TickMark;
  /** Where we learned their value: a record is certain, a claim could be a lie. */
  source?: 'record' | 'claim';
  value?: string;
}

export interface SuspectInfo {
  id: string;
  ticks: Tick[];
  matches: number;
  mismatches: number;
  recordMismatch: boolean;
  cleared: boolean;
  status: string;
  tone: 'good' | 'bad' | 'neutral' | 'cleared';
  sortKey: number;
}

/** What I know about each player's traits: records beat answers they gave me. */
export function knownTraits(cv: CaseView): Map<string, Map<QuestionDim, { value: string; source: 'record' | 'claim' }>> {
  const out = new Map<string, Map<QuestionDim, { value: string; source: 'record' | 'claim' }>>();
  const set = (pid: string, dim: QuestionDim, value: string, source: 'record' | 'claim') => {
    const m = out.get(pid) ?? new Map();
    if (m.get(dim)?.source !== 'record') m.set(dim, { value, source });
    out.set(pid, m);
  };
  for (const q of cv.asked) if (q.answer?.value) set(q.targetId, q.dim, q.answer.value, 'claim');
  for (const n of [...cv.hand, ...cv.seen]) if (n.fact.kind === 'record') set(n.fact.playerId, n.fact.dim, n.fact.value, 'record');
  return out;
}

export function clearedPlayers(cv: CaseView): Set<string> {
  return new Set([...cv.hand, ...cv.seen].flatMap((n) => (n.fact.kind === 'alibi' ? [n.fact.playerId] : [])));
}

export function suspectInfo(cv: CaseView, profile: ProfileEntry[], pid: string): SuspectInfo {
  const known = knownTraits(cv).get(pid);
  const cleared = clearedPlayers(cv).has(pid);
  const ticks: Tick[] = profile
    .filter((p) => p.status !== 'unknown')
    .map((p) => {
      const k = known?.get(p.dim);
      if (!k) return { dim: p.dim, mark: 'unknown' };
      const possible = p.best ? [p.best] : p.values.map((v) => v.value);
      return { dim: p.dim, mark: possible.includes(k.value) ? 'match' : 'mismatch', source: k.source, value: k.value };
    });
  const matches = ticks.filter((t) => t.mark === 'match').length;
  const mismatches = ticks.filter((t) => t.mark === 'mismatch').length;
  const recordMismatch = ticks.some((t) => t.mark === 'mismatch' && t.source === 'record');
  const knownCount = matches + mismatches;

  let status: string;
  let tone: SuspectInfo['tone'];
  if (cleared) {
    status = 'Cleared by an alibi';
    tone = 'cleared';
  } else if (recordMismatch) {
    status = "Doesn't match — a record proves it";
    tone = 'bad';
  } else if (mismatches > 0) {
    status = "Doesn't match what they told you";
    tone = 'bad';
  } else if (knownCount > 0) {
    status = matches === ticks.length ? 'Matches everything you know so far' : `Matches ${matches} of ${ticks.length} clues so far`;
    tone = 'good';
  } else if (ticks.length === 0) {
    status = 'No clues about the killer yet';
    tone = 'neutral';
  } else {
    status = 'You know nothing about them yet';
    tone = 'neutral';
  }
  const sortKey = cleared ? -100 : recordMismatch ? -20 + matches : matches * 2 - mismatches * 3;
  return { id: pid, ticks, matches, mismatches, recordMismatch, cleared, status, tone, sortKey };
}

export function allSuspects(cv: CaseView, profile: ProfileEntry[], me: string): SuspectInfo[] {
  return Object.keys(cv.cast)
    .filter((id) => id !== me)
    .map((id) => suspectInfo(cv, profile, id))
    .sort((a, b) => Number(cv.pins.includes(b.id)) - Number(cv.pins.includes(a.id)) || b.sortKey - a.sortKey);
}

/** Plain-English meaning of a note, for the chip under it. */
export function noteMeaning(note: NoteView, nameOf: (id: string) => string): { icon: string; text: string } {
  const f = note.fact;
  if (f.kind === 'killer') return { icon: '🔎', text: `Tells you: the killer's ${TRAIT_LABEL[f.dim]} is ${f.value}` };
  if (f.kind === 'record') return { icon: '📄', text: `Fact: ${nameOf(f.playerId)}'s ${TRAIT_LABEL[f.dim]} is ${f.value}` };
  return { icon: '✅', text: `Clears ${nameOf(f.playerId)} — they have an alibi` };
}

export type Suggestion =
  | { kind: 'ask'; targetId: string; dim: QuestionDim; text: string }
  | { kind: 'swap'; targetId?: string; text: string }
  | { kind: 'info'; text: string };

/** A single helpful next move for this round. Never names a "top suspect". */
export function suggestNext(cv: CaseView, profile: ProfileEntry[], round: RoundId, me: string, nameOf: (id: string) => string): Suggestion | null {
  const kb = cv.killerBriefing;
  const unknownDims = profile.filter((p) => p.status === 'unknown').map((p) => p.dim);
  const conflict = profile.find((p) => p.status === 'conflict');

  if (kb) {
    const forged = cv.hand.filter((n) => n.fact.kind === 'killer' && kb.dangerousDims.includes(n.fact.dim) && n.fact.value !== cv.card.traits[n.fact.dim]);
    if (isQuestionRound(round) && cv.role === 'killer') {
      return { kind: 'info', text: `Only lie about your ${kb.dangerousDims.map((d) => TRAIT_LABEL[d]).join(', ')} — the rest is safe to tell the truth.` };
    }
    if (isTradingRound(round)) {
      const tip = kb.tipOff.find((t) => t.playerId !== me);
      if (tip) return { kind: 'swap', targetId: tip.playerId, text: `${nameOf(tip.playerId)} holds real evidence about the killer's ${TRAIT_LABEL[tip.dim]} — swap with them and keep it hidden.` };
      if (forged.length) return { kind: 'info', text: 'Get your forged note into a detective\'s hands — offer a swap or give it away.' };
    }
    return null;
  }

  if (isQuestionRound(round) && cv.left.questions > 0) {
    const asked = new Set(cv.asked.map((q) => `${q.targetId}:${q.dim}`));
    const known = profile.filter((p) => p.best);
    const suspects = allSuspects(cv, profile, me).filter((s) => !s.cleared && !s.recordMismatch && !cv.busy.includes(s.id));
    for (const s of suspects) {
      const dim = known.map((p) => p.dim).find((d) => s.ticks.find((t) => t.dim === d)?.mark === 'unknown' && !asked.has(`${s.id}:${d}`));
      if (dim) {
        const lead = s.matches > 0 ? `they match ${s.matches} clue${s.matches > 1 ? 's' : ''} so far` : "you don't know much about them yet";
        return { kind: 'ask', targetId: s.id, dim, text: `Ask ${nameOf(s.id)} about their ${TRAIT_LABEL[dim]} — ${lead}.` };
      }
    }
    if (!known.length) return { kind: 'info', text: 'No clues about the killer yet — ask anyone anything, then compare later.' };
    return null;
  }

  if (isTradingRound(round)) {
    if (conflict) return { kind: 'info', text: `Your notes disagree about the killer's ${TRAIT_LABEL[conflict.dim]}. One is forged — think about who handed it to you.` };
    if (unknownDims.length && cv.left.requests > 0) {
      const target = cv.allies[0];
      return { kind: 'swap', targetId: target, text: `You don't know the killer's ${TRAIT_LABEL[unknownDims[0]]} yet — swap notes to find out.` };
    }
    return null;
  }

  if (round === 'accusation') return { kind: 'info', text: 'Pick whoever fits the Wanted poster best — and think about who lied to you.' };
  return null;
}
