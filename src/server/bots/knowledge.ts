// A bot's private notebook and deductions. Bots only ever read their own PlayerView, plus what
// they remember themselves (who handed them which note) — exactly what a human in the seat knows.
import type { NoteView, QuestionDim, TraitDim } from '../../shared/types.ts';
import type { CaseView } from '../../shared/view.ts';

export interface Memory {
  caseIndex: number;
  round?: string;
  /** Notes that were dealt to me (always genuine for a detective). */
  dealt: Set<string>;
  /** Who handed me each note I didn't get dealt. */
  sourceOf: Map<string, string>;
  knownNotes: Set<string>;
  /** Last swaps/gives I was part of, to attribute newly arrived notes. */
  lastPartners: Map<string, string>;
  /** What I told each asker per dim, to stay consistent when lying. */
  toldValue: Map<QuestionDim, string>;
  actionsThisRound: number;
  idleThinks: number;
  statementsMade: Set<string>;
  proposedAlliance: boolean;
  gaveForgery: Set<string>;
}

export function freshMemory(caseIndex: number): Memory {
  return {
    caseIndex,
    dealt: new Set(),
    sourceOf: new Map(),
    knownNotes: new Set(),
    lastPartners: new Map(),
    toldValue: new Map(),
    actionsThisRound: 0,
    idleThinks: 0,
    statementsMade: new Set(),
    proposedAlliance: false,
    gaveForgery: new Set(),
  };
}

/** Record new notes: in non-trading rounds they were dealt; otherwise attribute to a partner. */
export function observeNotes(mem: Memory, cv: CaseView, round: string, me: string) {
  const trading = round === 'trading' || round === 'finalTrades';
  for (const n of [...cv.hand, ...cv.seen]) {
    if (mem.knownNotes.has(n.id)) continue;
    mem.knownNotes.add(n.id);
    if (!trading && cv.hand.some((h) => h.id === n.id)) mem.dealt.add(n.id);
    else {
      const src = mem.lastPartners.get(n.id) ?? mem.lastPartners.get('*');
      if (src) mem.sourceOf.set(n.id, src);
    }
  }
  // Remember current partners so notes arriving before the next think can be attributed.
  mem.lastPartners.clear();
  for (const s of cv.swaps) {
    const i = s.members.indexOf(me);
    if (i >= 0) mem.lastPartners.set('*', s.members[(i - 1 + s.members.length) % s.members.length]);
  }
  for (const g of cv.gives) if (g.toId === me) mem.lastPartners.set('*', g.fromId);
}

export interface Deductions {
  /** Best-guess killer value per trait dim, with confidence 0..1. */
  facts: Map<TraitDim, { value: string; confidence: number }>;
  /** Players who handed me evidence that contradicts stronger evidence. */
  forgerySuspects: Map<string, number>;
  /** Known true traits (from records). */
  known: Map<string, Map<QuestionDim, string>>;
  /** Claims made to me (answers). */
  claims: Map<string, Map<QuestionDim, string>>;
  liars: Set<string>;
  noComments: Map<string, number>;
  cleared: Set<string>;
  scores: Map<string, number>;
  ranking: string[];
}

const SOLITARY_HINT = ['Smoking area', 'Cloakroom', 'Car park', 'Bathroom corridor'];

export function deduce(cv: CaseView, mem: Memory, me: string): Deductions {
  const facts = new Map<TraitDim, { value: string; confidence: number }>();
  const forgerySuspects = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  const trustOf = (n: NoteView, announced: boolean) => {
    if (announced) return 3;
    if (mem.dealt.has(n.id)) return cv.role === 'detective' ? 2 : 0;
    return 1;
  };
  const byDim = new Map<TraitDim, Map<string, { weight: number; notes: NoteView[] }>>();
  const addFact = (n: NoteView, announced: boolean) => {
    if (n.fact.kind !== 'killer') return;
    const w = trustOf(n, announced);
    if (w === 0) return; // my own forgery
    const dimMap = byDim.get(n.fact.dim) ?? new Map();
    const entry = dimMap.get(n.fact.value) ?? { weight: 0, notes: [] };
    entry.weight += w;
    entry.notes.push(n);
    dimMap.set(n.fact.value, entry);
    byDim.set(n.fact.dim, dimMap);
  };
  cv.announcements.forEach((n) => addFact(n, true));
  const heldOrSeen = [...cv.hand, ...cv.seen];
  heldOrSeen.forEach((n) => addFact(n, false));

  for (const [dim, values] of byDim) {
    const sorted = [...values.entries()].sort((a, b) => b[1].weight - a[1].weight);
    const total = sorted.reduce((s, [, e]) => s + e.weight, 0);
    facts.set(dim, { value: sorted[0][0], confidence: sorted[0][1].weight / total });
    // Losing values in a contradiction point at whoever handed them over.
    for (const [, e] of sorted.slice(1)) {
      for (const n of e.notes) {
        const src = mem.sourceOf.get(n.id);
        if (src) bump(forgerySuspects, src, 2.5);
      }
    }
  }

  const known = new Map<string, Map<QuestionDim, string>>();
  const setKnown = (pid: string, dim: QuestionDim, v: string) => {
    const m = known.get(pid) ?? new Map();
    m.set(dim, v);
    known.set(pid, m);
  };
  const cleared = new Set<string>();
  for (const n of heldOrSeen) {
    if (n.fact.kind === 'record') setKnown(n.fact.playerId, n.fact.dim, n.fact.value);
    if (n.fact.kind === 'alibi') cleared.add(n.fact.playerId);
  }
  for (const w of cv.card.witnesses) setKnown(w, 'location', cv.card.location);

  const claims = new Map<string, Map<QuestionDim, string>>();
  const liars = new Set<string>();
  const noComments = new Map<string, number>();
  const socialSpot = cv.card.witnesses.length > 0;
  for (const q of cv.asked) {
    if (!q.answer) continue;
    if (q.answer.mode === 'nocomment' || !q.answer.value) {
      bump(noComments, q.targetId, 1);
      continue;
    }
    const m = claims.get(q.targetId) ?? new Map();
    m.set(q.dim, q.answer.value);
    claims.set(q.targetId, m);
    const truth = known.get(q.targetId)?.get(q.dim);
    if (truth !== undefined && truth !== q.answer.value) liars.add(q.targetId);
    // Claiming to be where I was, without being one of my witnesses, is a lie.
    if (q.dim === 'location' && q.answer.value === cv.card.location && (socialSpot ? !cv.card.witnesses.includes(q.targetId) : true)) {
      liars.add(q.targetId);
    }
  }
  for (const [pid, mark] of Object.entries(cv.marks)) if (mark === 'liar') liars.add(pid);

  // Public statements are weak signals.
  const talk = new Map<string, number>();
  for (const st of cv.statements) {
    if (st.by === me) continue;
    if (st.type === 'lied' && st.targetId) bump(talk, st.targetId, 0.5);
    if (st.type === 'suspect' && st.targetId) bump(talk, st.targetId, 0.2);
    if (st.type === 'vouch' && st.targetId) bump(talk, st.targetId, -0.2);
    if (st.type === 'wasAt' && st.value) {
      const m = claims.get(st.by) ?? new Map();
      if (!m.has('location')) m.set('location', st.value);
      claims.set(st.by, m);
    }
  }

  const scores = new Map<string, number>();
  const others = Object.keys(cv.cast).filter((id) => id !== me);
  for (const pid of others) {
    let s = 0;
    for (const [dim, f] of facts) {
      const k = known.get(pid)?.get(dim);
      const c = claims.get(pid)?.get(dim);
      if (k !== undefined) s += k === f.value ? 2 * f.confidence : -6 * f.confidence;
      else if (c !== undefined) {
        const trust = liars.has(pid) ? 0.3 : 0.8;
        s += c === f.value ? 1.2 * f.confidence : -1.6 * f.confidence * trust;
      }
    }
    const loc = known.get(pid)?.get('location') ?? claims.get(pid)?.get('location');
    if (loc && SOLITARY_HINT.includes(loc)) s += 0.8;
    if (cv.card.witnesses.includes(pid)) s -= 0.5;
    s += talk.get(pid) ?? 0;
    s += (forgerySuspects.get(pid) ?? 0) * 0.6;
    if (liars.has(pid)) s += 1.5;
    s += (noComments.get(pid) ?? 0) * 0.6;
    if (cleared.has(pid)) s -= 100;
    if (cv.marks[pid] === 'cleared') s -= 3;
    scores.set(pid, s);
  }
  const ranking = [...others].sort((a, b) => scores.get(b)! - scores.get(a)!);
  return { facts, forgerySuspects, known, claims, liars, noComments, cleared, scores, ranking };
}
