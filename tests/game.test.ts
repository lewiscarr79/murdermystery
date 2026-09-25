import { describe, expect, it } from 'vitest';
import { act, addPlayer, createGame, hostAdvance, isFinished, nextDeadline, setConnected, startGame, tick, waitingOn, type GameState } from '../src/engine/game.ts';
import { playerView } from '../src/engine/views.ts';
import { ROUND_ORDER, hasWrapUp } from '../src/shared/rules.ts';
import type { Action, RoundId } from '../src/shared/types.ts';

function setup(n: number, seed = 1): { s: GameState; ids: string[]; now: number } {
  const s = createGame('ABCD', { id: 'p0', name: 'P0' }, seed);
  for (let i = 1; i < n; i++) addPlayer(s, { id: `p${i}`, name: `P${i}` });
  s.settings.cases = 2;
  s.settings.practice = false;
  startGame(s, 0);
  tick(s, 3000);
  return { s, ids: s.players.map((p) => p.id), now: 3000 };
}

let clock = 10_000;
/** Jump rounds using the host's skip, so each test can focus on one round. */
function goTo(s: GameState, round: RoundId): number {
  while (s.round !== round) hostAdvance(s, s.hostId, (clock += 1000));
  return clock;
}

function skipAll(s: GameState) {
  while (s.phase === 'playing') hostAdvance(s, s.hostId, (clock += 1000));
}

function must(s: GameState, pid: string, a: Action, now: number) {
  const r = act(s, pid, a, now);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}

/** Tap "I'm finished" through both steps of the round. */
function finish(s: GameState, pid: string, now: number) {
  must(s, pid, { type: 'done' }, now);
  if (hasWrapUp(s.round!)) must(s, pid, { type: 'done' }, now);
}

/** Everyone makes their forced-swap pick. */
function resolveForced(s: GameState, now: number) {
  for (const sw of s.current!.swaps.filter((x) => x.kind === 'forced' && x.status === 'picking')) {
    for (const m of sw.members) {
      if (sw.status !== 'picking' || sw.picks[m]) continue;
      must(s, m, { type: 'pickSwap', swapId: sw.id, noteId: s.current!.hands[m][0] }, now);
    }
  }
}

const killerSide = (s: GameState) => [s.current!.gen.killerId, ...s.current!.gen.accompliceIds];
const detectives = (s: GameState) => s.players.map((p) => p.id).filter((id) => !killerSide(s).includes(id));

describe('game flow', () => {
  it('counts down, then advances each round only once every active player is finished', () => {
    const s = createGame('ABCD', { id: 'p0', name: 'P0' }, 3);
    for (let i = 1; i < 6; i++) addPlayer(s, { id: `p${i}`, name: `P${i}` });
    s.settings.practice = false;
    expect(startGame(s, 1000).ok).toBe(true);
    expect(s.phase).toBe('starting');
    expect(nextDeadline(s)).toBe(4000);
    tick(s, 3999);
    expect(s.phase).toBe('starting');
    tick(s, 4000);
    expect(s.round).toBe('briefing');
    expect(nextDeadline(s)).toBeNull(); // no round timers
    const ids = s.players.map((p) => p.id);
    const seen: RoundId[] = [s.round!];
    let now = 5000;
    while (s.caseIndex === 0 && s.phase === 'playing') {
      tick(s, (now += 60_000));
      expect(seen[seen.length - 1]).toBe(s.round); // time alone never moves the round on
      const round = s.round!;
      for (const id of ids) {
        if (round === 'accusation') must(s, id, { type: 'accuse', targetId: ids.find((x) => x !== id)!, stake: 'hunch' }, now);
        else if (round === 'trading' || round === 'finalTrades') {
          for (const sw of s.current!.swaps.filter((x) => x.status === 'picking' && x.members.includes(id) && !x.picks[id])) {
            must(s, id, { type: 'pickSwap', swapId: sw.id, noteId: s.current!.hands[id].find((n) => !Object.values(sw.picks).includes(n))! }, now);
          }
          finish(s, id, now);
        } else finish(s, id, now);
      }
      tick(s, now);
      if (s.caseIndex === 0) seen.push(s.round!);
    }
    expect(seen).toEqual(ROUND_ORDER);
  });

  it('waits for unanswered questions and lists who is holding things up', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'questioning');
    must(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'coat' }, now);
    for (const id of ids) finish(s, id, now);
    tick(s, now);
    expect(s.round).toBe('questioning');
    expect(isFinished(s, ids[1])).toBe(false);
    expect(waitingOn(s)).toEqual([{ playerId: ids[1], reason: 'answering a question' }]);
    // The reason is vague: it never names the asker or the question.
    expect(JSON.stringify(waitingOn(s))).not.toContain(ids[0]);
    must(s, ids[1], { type: 'answer', questionId: s.current!.questions[0].id, mode: 'truth' }, now);
    tick(s, now);
    expect(s.round).toBe('trading');
  });

  it('a new question makes a finished player unfinished again', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'questioning');
    finish(s, ids[1], now);
    expect(isFinished(s, ids[1])).toBe(true);
    must(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'drink' }, now);
    expect(isFinished(s, ids[1])).toBe(false);
  });

  it('never waits on disconnected players and resolves their pending items', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'questioning');
    must(s, ids[0], { type: 'ask', targetId: ids[5], dim: 'coat' }, now);
    setConnected(s, ids[5], false);
    for (const id of ids.slice(0, 5)) finish(s, id, now);
    tick(s, now);
    expect(s.round).toBe('trading');
    expect(s.current!.questions[0].answer!.mode).toBe('nocomment');
  });

  it('lets the host move on without stragglers', () => {
    const { s, ids } = setup(5);
    const now = goTo(s, 'evidence');
    expect(hostAdvance(s, ids[1], now).ok).toBe(false);
    expect(hostAdvance(s, ids[0], now).ok).toBe(true);
    expect(s.round).toBe('questioning');
  });

  it('refuses to start below 4 players', () => {
    const s = createGame('ABCD', { id: 'p0', name: 'P0' }, 3);
    addPlayer(s, { id: 'p1', name: 'x' });
    expect(startGame(s, 0).ok).toBe(false);
  });

  it('deals notes and announcements in the evidence rounds', () => {
    const { s, ids } = setup(6);
    goTo(s, 'evidence');
    for (const id of ids) expect(s.current!.hands[id]).toHaveLength(2);
    expect(s.current!.announcements).toHaveLength(1);
    goTo(s, 'evidence2');
    expect(s.current!.announcements).toHaveLength(2);
  });

  it('rejects actions outside their round', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'evidence');
    expect(act(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'coat' }, now).ok).toBe(false);
    expect(act(s, ids[0], { type: 'requestSwap', targetId: ids[1] }, now).ok).toBe(false);
  });

  it('moves on as soon as everyone has finished both steps', () => {
    const { s, ids } = setup(5);
    const now = goTo(s, 'evidence');
    for (const id of ids) must(s, id, { type: 'done' }, now + 10);
    tick(s, now + 10);
    expect(s.round).toBe('evidence'); // everyone is at the end-of-round step
    for (const id of ids) must(s, id, { type: 'done' }, now + 10);
    tick(s, now + 10);
    expect(s.round).toBe('questioning');
  });

  it('finishes after the configured number of cases', () => {
    const { s } = setup(4);
    skipAll(s);
    expect(s.phase).toBe('over');
    expect(s.results).toHaveLength(2);
  });

  it('adds a practice case first whose points do not count', () => {
    const s = createGame('ABCD', { id: 'p0', name: 'P0' }, 9);
    for (let i = 1; i < 6; i++) addPlayer(s, { id: `p${i}`, name: `P${i}` });
    s.settings.cases = 2;
    startGame(s, 0);
    tick(s, 3000);
    goTo(s, 'accusation');
    const killer = s.current!.gen.killerId;
    const det = s.players.map((p) => p.id).find((id) => id !== killer && !s.current!.gen.accompliceIds.includes(id))!;
    must(s, det, { type: 'accuse', targetId: killer, stake: 'sure' }, clock);
    goTo(s, 'reveal');
    expect(s.current!.result!.practice).toBe(true);
    expect(s.current!.result!.scores[det].total).toBe(100);
    expect(s.players.every((p) => p.score === 0)).toBe(true);
    skipAll(s);
    expect(s.results).toHaveLength(3);
    expect(s.results.filter((r) => r.practice)).toHaveLength(1);
  });
});

describe('questioning', () => {
  it('enforces limits, busy targets, no repeats and the lie budget', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'questioning');
    must(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'coat' }, now);
    expect(act(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'coat' }, now).ok).toBe(false);
    must(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'drink' }, now);
    expect(act(s, ids[0], { type: 'ask', targetId: ids[2], dim: 'coat' }, now).ok).toBe(false); // 2 per round at 6
    must(s, ids[2], { type: 'ask', targetId: ids[1], dim: 'phone' }, now);
    expect(act(s, ids[3], { type: 'ask', targetId: ids[1], dim: 'team' }, now).ok).toBe(false); // busy
    expect(playerView(s, ids[3], now).case!.busy).toContain(ids[1]);

    const qs = s.current!.questions.filter((q) => q.targetId === ids[1]);
    const opts = s.current!.gen.lieOptions[ids[1]];
    expect(act(s, ids[1], { type: 'answer', questionId: qs[0].id, mode: 'lie', lieValue: 'nonsense' }, now).ok).toBe(false);
    must(s, ids[1], { type: 'answer', questionId: qs[0].id, mode: 'lie', lieValue: opts.coat[0] }, now);
    must(s, ids[1], { type: 'answer', questionId: qs[1].id, mode: 'truth' }, now);
    expect(s.current!.liesLeft[ids[1]]).toBe(2);
    expect(qs[1].answer!.value).toBe(s.current!.gen.cards[ids[1]].traits.drink);

    // The asker never learns an answer was a lie.
    const askerView = playerView(s, ids[0], now).case!;
    expect(askerView.asked.every((a) => a.answer?.mode !== 'lie')).toBe(true);

    // Unanswered questions become "No comment" if the host moves on.
    hostAdvance(s, s.hostId, now);
    expect(qs[2].answer!.mode).toBe('nocomment');
  });

  it('greys out lying once 3 lies are spent', () => {
    const { s, ids } = setup(10);
    let now = goTo(s, 'questioning');
    const target = ids[9];
    const lie = (dim: 'coat' | 'drink' | 'phone' | 'team' | 'arrival', asker: string) => {
      must(s, asker, { type: 'ask', targetId: target, dim }, now);
      const q = s.current!.questions[s.current!.questions.length - 1];
      return act(s, target, { type: 'answer', questionId: q.id, mode: 'lie', lieValue: s.current!.gen.lieOptions[target][dim][0] }, now);
    };
    expect(lie('coat', ids[0]).ok).toBe(true);
    expect(lie('drink', ids[1]).ok).toBe(true);
    expect(lie('phone', ids[2]).ok).toBe(true);
    now = goTo(s, 'evidence2');
    expect(lie('team', ids[3]).ok).toBe(false);
  });
});

describe('trading', () => {
  it('creates forced blind swaps with a trio when numbers are odd, waiting for every pick', () => {
    const { s } = setup(7);
    const now = goTo(s, 'trading');
    const forced = s.current!.swaps.filter((x) => x.kind === 'forced');
    expect(forced.map((f) => f.members.length).sort()).toEqual([2, 2, 3]);
    expect(waitingOn(s).every((w) => w.reason === 'choosing a note to swap')).toBe(true);
    const before = JSON.stringify(s.current!.hands);
    tick(s, now + 600_000);
    expect(forced.every((f) => f.status === 'picking')).toBe(true); // no auto-pick
    resolveForced(s, now);
    expect(forced.every((f) => f.status === 'done')).toBe(true);
    expect(JSON.stringify(s.current!.hands)).not.toBe(before);
    // Everyone still holds the same number of notes after a rotation.
    for (const id of Object.keys(s.current!.hands)) expect(s.current!.hands[id]).toHaveLength(2);
  });

  it('runs a requested swap: accept, both pick blind, notes change hands and stay in "seen"', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'trading');
    resolveForced(s, now);
    const [a, b] = ids;
    must(s, a, { type: 'requestSwap', targetId: b }, now);
    expect(act(s, a, { type: 'requestSwap', targetId: ids[2] }, now).ok).toBe(false); // one pending at a time
    const swap = s.current!.swaps[s.current!.swaps.length - 1];
    must(s, b, { type: 'respondSwap', swapId: swap.id, accept: true }, now);
    const na = s.current!.hands[a][0];
    const nb = s.current!.hands[b][0];
    must(s, a, { type: 'pickSwap', swapId: swap.id, noteId: na }, now);
    expect(playerView(s, a, now).case!.lockedNoteIds).toContain(na);
    must(s, b, { type: 'pickSwap', swapId: swap.id, noteId: nb }, now);
    expect(s.current!.hands[a]).toContain(nb);
    expect(s.current!.hands[b]).toContain(na);
    expect(s.current!.seen[a]).toContain(na);
    expect(s.current!.hands[a].filter((x) => x === na)).toHaveLength(0);
  });

  it('holds the round for unanswered requests; the sender can cancel', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'trading');
    resolveForced(s, now);
    must(s, ids[0], { type: 'requestSwap', targetId: ids[1] }, now);
    const s1 = s.current!.swaps[s.current!.swaps.length - 1];
    for (const id of ids) finish(s, id, now);
    tick(s, now + 600_000);
    expect(s.round).toBe('trading');
    expect(waitingOn(s).map((w) => w.reason).sort()).toEqual(['responding to a request', 'waiting on their own request']);
    expect(act(s, ids[2], { type: 'cancelRequest', requestId: s1.id }, now).ok).toBe(false); // only the sender
    must(s, ids[0], { type: 'cancelRequest', requestId: s1.id }, now);
    expect(s1.status).toBe('cancelled');
    tick(s, now);
    expect(s.round).toBe('evidence2');
  });

  it('cancels a half-picked swap if the host moves on', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'trading');
    resolveForced(s, now);
    must(s, ids[0], { type: 'requestSwap', targetId: ids[1] }, now);
    const s1 = s.current!.swaps[s.current!.swaps.length - 1];
    must(s, ids[1], { type: 'respondSwap', swapId: s1.id, accept: true }, now);
    must(s, ids[0], { type: 'pickSwap', swapId: s1.id, noteId: s.current!.hands[ids[0]][0] }, now);
    const r = hostAdvance(s, s.hostId, now);
    expect(s1.status).toBe('cancelled');
    expect(r.ok && r.events.some((e) => e.type === 'toast' && e.to === ids[0])).toBe(true);
  });

  it('allows one optional move per trading round, but allies swap freely', () => {
    const { s, ids } = setup(6);
    let now = goTo(s, 'questioning');
    const [a, b, c, d] = ids;
    // Alliances are formed in the end-of-round step.
    expect(act(s, a, { type: 'proposeAlliance', targetId: d }, now).ok).toBe(false);
    must(s, a, { type: 'done' }, now);
    must(s, a, { type: 'proposeAlliance', targetId: d }, now);
    must(s, d, { type: 'respondAlliance', allianceId: s.current!.alliances[0].id, accept: true }, now);
    now = goTo(s, 'trading');
    resolveForced(s, now);
    must(s, a, { type: 'requestSwap', targetId: b }, now);
    must(s, b, { type: 'respondSwap', swapId: s.current!.swaps.at(-1)!.id, accept: false }, now);
    expect(act(s, a, { type: 'requestSwap', targetId: c }, now).ok).toBe(false);
    expect(act(s, a, { type: 'show', targetId: c, noteId: s.current!.hands[a][0] }, now).ok).toBe(false);
    expect(act(s, a, { type: 'requestSwap', targetId: d }, now).ok).toBe(true);
  });

  it('splits each round into a main step then an end-of-round step', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'questioning');
    expect(act(s, ids[0], { type: 'statement', statementType: 'vouch', targetId: ids[1] }, now).ok).toBe(false);
    must(s, ids[0], { type: 'done' }, now);
    expect(s.current!.stage[ids[0]]).toBe('wrap');
    expect(isFinished(s, ids[0])).toBe(false);
    expect(act(s, ids[0], { type: 'ask', targetId: ids[1], dim: 'coat' }, now).ok).toBe(false);
    must(s, ids[0], { type: 'statement', statementType: 'vouch', targetId: ids[1] }, now);
    expect(act(s, ids[0], { type: 'statement', statementType: 'lied', targetId: ids[2] }, now).ok).toBe(false); // one per round
    must(s, ids[0], { type: 'done' }, now);
    expect(isFinished(s, ids[0])).toBe(true);
    expect(waitingOn(s).find((w) => w.playerId === ids[0])).toBeUndefined();
  });

  it('gives and shows notes; shows flash and land in "seen" only, with a limit', () => {
    const { s, ids } = setup(6);
    const now = goTo(s, 'trading');
    resolveForced(s, now);
    const [a, b, c, d] = ids;
    const note = s.current!.hands[a][0];
    const events = must(s, a, { type: 'show', targetId: b, noteId: note }, now);
    expect(events[0]).toMatchObject({ type: 'flash', to: b, noteId: note });
    expect(s.current!.seen[b]).toContain(note);
    expect(s.current!.hands[a]).toContain(note);
    expect(act(s, a, { type: 'show', targetId: c, noteId: note }, now).ok).toBe(false); // one move per round

    const note2 = s.current!.hands[c][0];
    must(s, c, { type: 'give', targetId: d, noteId: note2 }, now);
    must(s, d, { type: 'respondGive', giveId: s.current!.gives[0].id, accept: true }, now);
    expect(s.current!.hands[d]).toContain(note2);
    expect(s.current!.hands[c]).not.toContain(note2);
  });

  it('disables alliances at 4 players and caps allies', () => {
    const four = setup(4);
    const now4 = goTo(four.s, 'trading');
    expect(act(four.s, 'p0', { type: 'proposeAlliance', targetId: 'p1' }, now4).ok).toBe(false);

    const { s, ids } = setup(6);
    const now = goTo(s, 'trading');
    resolveForced(s, now);
    must(s, ids[0], { type: 'done' }, now);
    must(s, ids[0], { type: 'proposeAlliance', targetId: ids[1] }, now);
    must(s, ids[1], { type: 'respondAlliance', allianceId: s.current!.alliances[0].id, accept: true }, now);
    expect(act(s, ids[0], { type: 'proposeAlliance', targetId: ids[2] }, now).ok).toBe(false);
  });

  it('allows one statement per round and drops "I suspect" at 10+', () => {
    const small = setup(6);
    const n6 = goTo(small.s, 'evidence');
    must(small.s, 'p0', { type: 'done' }, n6);
    must(small.s, 'p0', { type: 'statement', statementType: 'suspect', targetId: 'p1' }, n6);
    expect(act(small.s, 'p0', { type: 'statement', statementType: 'vouch', targetId: 'p1' }, n6).ok).toBe(false);

    const big = setup(10);
    const n10 = goTo(big.s, 'questioning');
    must(big.s, 'p0', { type: 'done' }, n10);
    expect(act(big.s, 'p0', { type: 'statement', statementType: 'suspect', targetId: 'p1' }, n10).ok).toBe(false);
    must(big.s, 'p0', { type: 'statement', statementType: 'wasAt', value: 'Rooftop bar' }, n10);
  });
});

describe('scoring', () => {
  it('rewards detectives who catch the killer and caps the killer', () => {
    const { s } = setup(8);
    const now = goTo(s, 'accusation');
    const killer = s.current!.gen.killerId;
    const dets = detectives(s);
    must(s, dets[0], { type: 'accuse', targetId: killer, stake: 'sure' }, now);
    must(s, dets[1], { type: 'accuse', targetId: killer, stake: 'hunch' }, now);
    const wrong = dets.find((d) => d !== s.current!.gen.patsyId && d !== dets[0] && d !== dets[1])!;
    must(s, wrong, { type: 'accuse', targetId: s.current!.gen.patsyId, stake: 'sure' }, now);
    expect(act(s, dets[0], { type: 'accuse', targetId: dets[1], stake: 'sure' }, now).ok).toBe(false); // locked
    hostAdvance(s, s.hostId, now);
    const r = s.current!.result!;
    expect(r.scores[dets[0]].total).toBe(100);
    expect(r.scores[dets[1]].total).toBe(50);
    expect(r.scores[wrong].total).toBe(-30);
    expect(r.scores[killer].total).toBeLessThanOrEqual(120);
    expect(r.scores[killer].total).toBeGreaterThan(0);
    expect(r.correctIds.sort()).toEqual([dets[0], dets[1]].sort());
  });

  it('pays the lie-exposed bonus only for real lies', () => {
    const { s } = setup(6);
    let now = goTo(s, 'questioning');
    const [d1, d2] = detectives(s);
    const killer = s.current!.gen.killerId;
    must(s, d1, { type: 'ask', targetId: killer, dim: 'coat' }, now);
    must(s, killer, { type: 'answer', questionId: s.current!.questions[0].id, mode: 'lie', lieValue: s.current!.gen.lieOptions[killer].coat[0] }, now);
    must(s, d1, { type: 'mark', targetId: killer, mark: 'liar' }, now);
    must(s, d2, { type: 'mark', targetId: killer, mark: 'liar' }, now);
    now = goTo(s, 'reveal');
    const r = s.current!.result!;
    expect(r.scores[d1].lines.some((l) => l.label.startsWith('Exposed'))).toBe(true);
    expect(r.scores[d2].lines.some((l) => l.label.startsWith('Exposed'))).toBe(false);
    expect(r.lies[0]).toMatchObject({ by: killer, to: d1, exposed: true });
  });
});

describe('redaction', () => {
  it('never leaks hidden truth to detectives before the reveal', () => {
    for (const n of [4, 8, 16, 22]) {
      const { s } = setup(n, n);
      for (const round of ROUND_ORDER.slice(0, 7)) {
        const now = goTo(s, round);
        for (const d of detectives(s)) {
          const v = playerView(s, d, now);
          const json = JSON.stringify(v);
          expect(v.case!.role).toBe('detective');
          expect(v.case!.killerBriefing).toBeUndefined();
          expect(v.lastResult).toBeUndefined();
          expect(json).not.toContain('"forged"');
          expect(json).not.toContain('trails');
          expect(json).not.toContain('"lied"');
          // Only my own card's traits are present.
          const mine = JSON.stringify(s.current!.gen.cards[d].traits);
          for (const other of s.players.map((p) => p.id).filter((id) => id !== d)) {
            const theirs = JSON.stringify(s.current!.gen.cards[other].traits);
            if (theirs !== mine) expect(json).not.toContain(theirs);
          }
        }
        for (const k of killerSide(s)) {
          const v = playerView(s, k, now);
          expect(v.case!.killerBriefing!.killerId).toBe(s.current!.gen.killerId);
        }
      }
    }
  });
});
