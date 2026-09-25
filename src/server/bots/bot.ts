// A bot player. It reads only its own redacted view and returns at most one action per "think".
import { isQuestionRound, isTradingRound } from '../../shared/rules.ts';
import type { Action, BotLevel, RoundId } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import { createRng, type Rng } from '../../engine/rng.ts';
import { chooseQuestion, detectiveAccuse, detectiveAnswer, detectiveMarks, detectiveStatement, detectiveTrade } from './detectiveBot.ts';
import { deduce, freshMemory, observeNotes, type Memory } from './knowledge.ts';
import { killerAccuse, killerAnswer, killerStatement, killerTrade } from './killerBot.ts';

const PACE: Record<BotLevel, [number, number]> = {
  easy: [2500, 7000],
  normal: [1800, 5000],
  sharp: [1200, 3500],
};

export class Bot {
  readonly id: string;
  readonly level: BotLevel;
  private rng: Rng;
  private mem: Memory = freshMemory(-1);

  constructor(id: string, level: BotLevel, seed: number) {
    this.id = id;
    this.level = level;
    this.rng = createRng(seed);
  }

  /** Delay before the next think, in ms (human-like). */
  nextDelay(): number {
    const [lo, hi] = PACE[this.level];
    return lo + this.rng.next() * (hi - lo);
  }

  think(view: PlayerView): Action | null {
    const cv = view.case;
    if (view.phase !== 'playing' || !cv || !view.round) return null;
    const round = view.round as RoundId;
    if (this.mem.caseIndex !== view.caseIndex) this.mem = freshMemory(view.caseIndex);
    if (this.mem.round !== round) {
      this.mem.round = round;
      this.mem.actionsThisRound = 0;
      this.mem.idleThinks = 0;
    }
    observeNotes(this.mem, cv, round, this.id);
    const action = this.decide(view, round);
    if (action) {
      this.mem.actionsThisRound++;
      this.mem.idleThinks = 0;
    } else {
      this.mem.idleThinks++;
    }
    return action;
  }

  private decide(view: PlayerView, round: RoundId): Action | null {
    const cv = view.case!;
    const rng = this.rng;
    const killerSide = cv.role !== 'detective';
    const d = deduce(cv, this.mem, this.id);
    const doneAfter = (idle: number): Action | null => (!cv.done && this.mem.idleThinks >= idle ? { type: 'done' } : null);

    if (round === 'briefing' || round === 'reveal' || round === 'evidence') return doneAfter(round === 'evidence' ? 2 : 1);

    if (!killerSide) {
      const mark = detectiveMarks(cv, d);
      if (mark) return mark;
    }

    if (isQuestionRound(round)) {
      const answer = killerSide ? killerAnswer(cv, this.mem, rng) : detectiveAnswer(cv, d, rng, this.level);
      if (answer) return answer;
      if (rng.chance(0.7)) {
        const q = chooseQuestion(view, cv, d, rng, this.level, this.id);
        if (q) return q;
      }
      const st = killerSide ? killerStatement(cv, this.mem, rng) : detectiveStatement(cv, d, this.mem, rng);
      if (st) return st;
      return cv.left.questions <= 0 ? doneAfter(3) : null;
    }

    if (isTradingRound(round)) {
      const t = killerSide ? killerTrade(cv, this.mem, rng, this.id) : detectiveTrade(view, cv, d, this.mem, rng, this.id);
      if (t) return t;
      const st = killerSide ? killerStatement(cv, this.mem, rng) : detectiveStatement(cv, d, this.mem, rng);
      if (st) return st;
      const pendingForMe = cv.swaps.length > 0 || cv.gives.some((g) => g.toId === this.id) || cv.allianceRequests.some((a) => a.toId === this.id);
      return pendingForMe ? null : doneAfter(6);
    }

    if (round === 'accusation') {
      if (this.mem.idleThinks < 1) return null;
      return killerSide ? killerAccuse(cv, rng) : detectiveAccuse(cv, d, rng, this.level);
    }
    return null;
  }
}
