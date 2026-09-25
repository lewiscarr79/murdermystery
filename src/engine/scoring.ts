// Scoring and the end-of-case reveal summary.
import { SCORING } from '../shared/rules.ts';
import type { CharacterCard, QuestionDim, Stake } from '../shared/types.ts';
import type { GameState } from './game.ts';

export interface ScoreLine {
  label: string;
  points: number;
}

export interface CaseResult {
  caseIndex: number;
  killerId: string;
  accompliceIds: string[];
  patsyId: string;
  cards: Record<string, CharacterCard>;
  evidenceDims: string[];
  accusations: Record<string, { targetId: string; stake: Stake } | null>;
  correctIds: string[];
  forgeryTrails: { noteId: string; text: string; holders: string[]; endedWith: string }[];
  hiddenEvidence: { holderId: string; text: string }[];
  lies: { by: string; to: string; dim: QuestionDim; claimed: string; truth: string; exposed: boolean }[];
  alliances: [string, string][];
  scores: Record<string, { total: number; lines: ScoreLine[] }>;
  detectiveAccuracy: number;
}

export function scoreCase(state: GameState): CaseResult {
  const c = state.current!;
  const g = c.gen;
  const killerSide = new Set([g.killerId, ...g.accompliceIds]);
  const detectives = g.playerIds.filter((id) => !killerSide.has(id));
  const acc = (id: string) => c.accusations[id];
  const correct = new Set(detectives.filter((id) => acc(id)?.targetId === g.killerId));
  const alliances = c.alliances.filter((a) => a.status === 'done').map((a) => [a.fromId, a.toId] as [string, string]);

  const lies = c.questions
    .filter((q) => q.answer?.lied)
    .map((q) => {
      const card = g.cards[q.targetId];
      const truth = q.dim === 'location' ? card.location : card.traits[q.dim];
      return {
        by: q.targetId,
        to: q.askerId,
        dim: q.dim,
        claimed: q.answer!.value!,
        truth,
        exposed: c.marks[q.askerId]?.[q.targetId] === 'liar',
      };
    });

  const scores: CaseResult['scores'] = {};
  const add = (id: string, label: string, points: number) => {
    scores[id] ??= { total: 0, lines: [] };
    if (points !== 0) scores[id].lines.push({ label, points });
    scores[id].total += points;
  };
  for (const id of g.playerIds) scores[id] = { total: 0, lines: [] };

  // Detectives.
  for (const d of detectives) {
    const a = acc(d);
    if (a) {
      if (a.targetId === g.killerId) add(d, `Caught the killer (${a.stake})`, a.stake === 'sure' ? SCORING.sureCorrect : SCORING.hunchCorrect);
      else if (g.accompliceIds.includes(a.targetId)) add(d, 'Accused an Accomplice', SCORING.accusedAccomplice);
      else add(d, `Wrong accusation (${a.stake})`, a.stake === 'sure' ? SCORING.sureWrong : SCORING.hunchWrong);
    }
    const exposedLiars = new Set(lies.filter((l) => l.to === d && l.exposed).map((l) => l.by));
    if (exposedLiars.size) add(d, `Exposed ${exposedLiars.size} liar(s)`, exposedLiars.size * SCORING.lieExposed);
  }
  for (const [x, y] of alliances) {
    if (correct.has(x) && correct.has(y)) {
      add(x, 'Alliance: both solved it', SCORING.allianceBothCorrect);
      add(y, 'Alliance: both solved it', SCORING.allianceBothCorrect);
    }
  }

  // Killer's side.
  const wrongShare = detectives.length ? (detectives.length - correct.size) / detectives.length : 0;
  const patsyAccusers = detectives.filter((id) => id !== g.patsyId && acc(id)?.targetId === g.patsyId).length;
  const forgeriesHeld = Object.values(g.notes).filter(
    (n) => n.forged && detectives.some((d) => c.hands[d].includes(n.id)),
  ).length;
  const sideScore = (id: string, share: number, cap: number) => {
    const lines: ScoreLine[] = [];
    const push = (label: string, points: number) => points && lines.push({ label, points: Math.round(points * share) });
    push(`Fooled ${detectives.length - correct.size}/${detectives.length} detectives`, SCORING.killerBase * wrongShare);
    push(`${patsyAccusers} accused the Patsy`, patsyAccusers * SCORING.killerPerPatsyAccuser);
    const unexposed = lies.filter((l) => l.by === id && !l.exposed).length;
    push(`${unexposed} lie(s) never exposed`, unexposed * SCORING.killerPerUnexposedLie);
    push(`${forgeriesHeld} forgery(ies) still believed`, forgeriesHeld * SCORING.killerPerForgeryHeld);
    const allyWrong = alliances
      .filter(([x, y]) => x === id || y === id)
      .map(([x, y]) => (x === id ? y : x))
      .filter((ally) => !killerSide.has(ally) && !correct.has(ally)).length;
    push(`${allyWrong} ally(ies) fooled`, allyWrong * SCORING.killerSideAllyWrong);
    let total = lines.reduce((s, l) => s + l.points, 0);
    if (total > cap) {
      lines.push({ label: 'Capped', points: cap - total });
      total = cap;
    }
    scores[id] = { total, lines };
  };
  sideScore(g.killerId, 1, SCORING.killerCap);
  for (const a of g.accompliceIds) {
    sideScore(a, SCORING.accompliceShare, Math.round(SCORING.killerCap * SCORING.accompliceShare));
    if (detectives.some((d) => acc(d)?.targetId === a)) add(a, 'Accused as Accomplice', SCORING.accompliceAccused);
  }

  const forgeryTrails = Object.values(g.notes)
    .filter((n) => n.forged)
    .map((n) => {
      const holders = c.trails[n.id] ?? [];
      return { noteId: n.id, text: n.text, holders, endedWith: holders[holders.length - 1] ?? '' };
    });
  const hiddenEvidence = [...killerSide].flatMap((id) =>
    c.hands[id]
      .map((nid) => g.notes[nid])
      .filter((n) => n.fact.kind === 'killer' && !n.forged)
      .map((n) => ({ holderId: id, text: n.text })),
  );

  return {
    caseIndex: state.caseIndex,
    killerId: g.killerId,
    accompliceIds: g.accompliceIds,
    patsyId: g.patsyId,
    cards: g.cards,
    evidenceDims: g.evidenceDims,
    accusations: Object.fromEntries(g.playerIds.map((id) => [id, acc(id) ? { targetId: acc(id).targetId, stake: acc(id).stake } : null])),
    correctIds: [...correct],
    forgeryTrails,
    hiddenEvidence,
    lies,
    alliances,
    scores,
    detectiveAccuracy: detectives.length ? correct.size / detectives.length : 0,
  };
}
