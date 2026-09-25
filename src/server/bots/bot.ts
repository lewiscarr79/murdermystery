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
    let action = this.decide(view, round);
    // Statements and alliances belong to the end-of-round step.
    if (action && cv.stage !== 'wrap' && (action.type === 'statement' || action.type === 'proposeAlliance')) action = null;
    // Private marks aren't progress: they must not keep a bot from finishing the round.
    if (action && action.type !== 'mark') {
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
    const doneAfter = (idle: number): Action | null => (!cv.ready && this.mem.idleThinks >= idle ? { type: 'done' } : null);

    if (round === 'briefing' || round === 'reveal') return doneAfter(1);

    if (!killerSide) {
      const mark = detectiveMarks(cv, d);
      if (mark) return mark;
    }

    // End-of-round step: maybe a statement, maybe team up, then finish.
    if (cv.stage === 'wrap') {
      const answer = isQuestionRound(round) ? (killerSide ? killerAnswer(cv, this.mem, rng) : detectiveAnswer(cv, d, rng, this.level)) : null;
      if (answer) return answer;
      const respond = isTradingRound(round) ? (killerSide ? killerTrade(cv, this.mem, rng, this.id) : detectiveTrade(view, cv, d, this.mem, rng, this.id)) : null;
      if (respond && (respond.type.startsWith('respond') || respond.type === 'pickSwap')) return respond;
      const incomingAlliance = cv.allianceRequests.find((a) => a.toId === this.id);
      if (incomingAlliance) return { type: 'respondAlliance', allianceId: incomingAlliance.id, accept: killerSide || rng.chance(0.55) };
      if (!this.mem.statementsMade.has(`round:${round}`)) {
        this.mem.statementsMade.add(`round:${round}`);
        const st = killerSide ? killerStatement(cv, this.mem, rng) : detectiveStatement(cv, d, this.mem, rng);
        if (st) return st;
      }
      if (cv.alliancesEnabled && cv.allies.length === 0 && !this.mem.proposedAlliance && rng.chance(killerSide ? 0.5 : 0.3)) {
        this.mem.proposedAlliance = true;
        const b = cv.killerBriefing;
        const pool = b
          ? (b.tipOff.length ? b.tipOff.map((t) => t.playerId) : Object.keys(cv.cast).filter((id) => id !== this.id && id !== b.killerId && !b.accompliceIds.includes(id)))
          : cv.card.witnesses.length
            ? cv.card.witnesses
            : d.ranking.slice(-3);
        if (pool.length) return { type: 'proposeAlliance', targetId: rng.pick(pool) };
      }
      const myAlliance = cv.allianceRequests.find((a) => a.fromId === this.id);
      if (myAlliance && this.mem.idleThinks >= 3) return { type: 'cancelRequest', requestId: myAlliance.id };
      const waitingOnMe =
        cv.incoming.length > 0 ||
        cv.swaps.some((s) => (s.status === 'picking' && !s.myPick) || (s.status === 'pending' && !s.iAmRequester)) ||
        cv.gives.some((g) => g.toId === this.id);
      return waitingOnMe ? null : doneAfter(1);
    }

    if (round === 'evidence') return doneAfter(2);

    if (isQuestionRound(round)) {
      const answer = killerSide ? killerAnswer(cv, this.mem, rng) : detectiveAnswer(cv, d, rng, this.level);
      if (answer) return answer;
      if (rng.chance(0.7)) {
        const q = chooseQuestion(view, cv, d, rng, this.level, this.id);
        if (q) return q;
      }
      const st = killerSide ? killerStatement(cv, this.mem, rng) : detectiveStatement(cv, d, this.mem, rng);
      if (st) return st;
      return doneAfter(cv.left.questions <= 0 ? 2 : 5);
    }

    if (isTradingRound(round)) {
      const t = killerSide ? killerTrade(cv, this.mem, rng, this.id) : detectiveTrade(view, cv, d, this.mem, rng, this.id);
      if (t) return t;
      // No timers any more: don't hold the table up waiting on a slow reply.
      const mine = cv.swaps.find((s) => s.iAmRequester && s.status === 'pending') ?? cv.gives.find((g) => g.fromId === this.id);
      const myAlliance = cv.allianceRequests.find((a) => a.fromId === this.id);
      if ((mine || myAlliance) && this.mem.idleThinks >= 4) return { type: 'cancelRequest', requestId: (mine ?? myAlliance)!.id };
      const st = killerSide ? killerStatement(cv, this.mem, rng) : detectiveStatement(cv, d, this.mem, rng);
      if (st) return st;
      const pendingForMe =
        cv.swaps.some((s) => (s.status === 'picking' && !s.myPick) || (s.status === 'pending' && !s.iAmRequester)) ||
        cv.gives.some((g) => g.toId === this.id) ||
        cv.allianceRequests.some((a) => a.toId === this.id);
      return pendingForMe ? null : doneAfter(6);
    }

    if (round === 'accusation') {
      if (this.mem.idleThinks < 1) return null;
      return killerSide ? killerAccuse(cv, rng) : detectiveAccuse(cv, d, rng, this.level);
    }
    return null;
  }
}
