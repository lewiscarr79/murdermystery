// Per-player redaction. Nothing hidden (killer id, forgery flags, other players' traits or hands,
// note sources) leaves the server before the reveal unless the player is entitled to it.
import {
  MAX_INCOMING_QUESTIONS,
  REQUESTS_PER_TRADING_ROUND,
  ROUND_ORDER,
  SHOWS_PER_TRADING_ROUND,
  alliancesEnabled,
  questionsPerRound,
  statementsPerRound,
  suspectStatementAllowed,
} from '../shared/rules.ts';
import type { Note, NoteView, Role } from '../shared/types.ts';
import type { CaseView, PlayerView } from '../shared/view.ts';
import { alliesOf, incomingQuestionsThisRound, type GameState } from './game.ts';

export function noteView(n: Note): NoteView {
  return { id: n.id, text: n.text, icon: n.icon, fact: n.fact };
}

export function roleOf(state: GameState, pid: string): Role {
  const g = state.current!.gen;
  if (g.killerId === pid) return 'killer';
  if (g.accompliceIds.includes(pid)) return 'accomplice';
  return 'detective';
}

export function playerView(state: GameState, pid: string, now: number): PlayerView {
  const view: PlayerView = {
    you: pid,
    code: state.code,
    hostId: state.hostId,
    phase: state.phase,
    startsAt: state.startsAt,
    serverNow: now,
    players: state.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, botLevel: p.botLevel, connected: p.connected, score: p.score })),
    settings: { ...state.settings },
    caseIndex: state.caseIndex,
    round: state.round,
    roundIndex: state.round ? ROUND_ORDER.indexOf(state.round) : undefined,
    roundEndsAt: state.roundEndsAt,
    results: state.phase === 'over' ? state.results : [],
  };
  const c = state.current;
  if (state.phase === 'playing' && c && state.players.some((p) => p.id === pid)) {
    view.case = caseView(state, pid);
    if (state.round === 'reveal' && c.result) view.lastResult = c.result;
  }
  if (state.phase === 'over') view.lastResult = state.results[state.results.length - 1];
  return view;
}

function caseView(state: GameState, pid: string): CaseView {
  const c = state.current!;
  const g = c.gen;
  const n = state.players.length;
  const role = roleOf(state, pid);
  const notes = (ids: string[]) => ids.map((id) => noteView(g.notes[id]));
  const counters = c.counters[pid];
  const round = state.round!;
  const locked = new Set<string>();
  for (const s of c.swaps) if (s.status === 'picking') Object.values(s.picks).forEach((x) => locked.add(x));
  for (const gv of c.gives) if (gv.status === 'pending') locked.add(gv.noteId);

  return {
    intro: state.pack.intro,
    card: g.cards[pid],
    role,
    cast: Object.fromEntries(g.playerIds.map((id) => [id, { name: g.cards[id].name, job: g.cards[id].job }])),
    killerBriefing:
      role === 'detective'
        ? undefined
        : {
            killerId: g.killerId,
            accompliceIds: g.accompliceIds,
            patsyId: g.patsyId,
            dangerousDims: g.evidenceDims,
            tipOff: role === 'accomplice' ? g.tipOff : [],
          },
    hand: notes(c.hands[pid]),
    seen: notes(c.seen[pid]),
    announcements: notes(c.announcements),
    liesLeft: c.liesLeft[pid],
    lieOptions: g.lieOptions[pid],
    left: {
      questions: questionsPerRound(n) - counters.asked,
      requests: REQUESTS_PER_TRADING_ROUND - counters.requests,
      shows: SHOWS_PER_TRADING_ROUND - counters.shows,
      statements: statementsPerRound(n) - counters.statements,
    },
    busy: g.playerIds.filter((id) => incomingQuestionsThisRound(state, id) >= MAX_INCOMING_QUESTIONS),
    asked: c.questions
      .filter((q) => q.askerId === pid)
      .map((q) => ({
        id: q.id,
        targetId: q.targetId,
        dim: q.dim,
        round: q.round,
        answer: q.answer ? { mode: q.answer.mode === 'lie' ? 'truth' : q.answer.mode, value: q.answer.value } : undefined,
      })),
    incoming: c.questions
      .filter((q) => q.targetId === pid && !q.answer && q.round === round)
      .map((q) => ({ id: q.id, askerId: q.askerId, dim: q.dim, question: state.pack.questions[q.dim] })),
    swaps: c.swaps
      .filter((s) => s.members.includes(pid) && (s.status === 'pending' || s.status === 'picking'))
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        members: s.members,
        status: s.status,
        deadline: s.deadline,
        myPick: s.picks[pid],
        iAmRequester: s.members[0] === pid,
      })),
    gives: c.gives
      .filter((gv) => gv.status === 'pending' && (gv.fromId === pid || gv.toId === pid))
      .map((gv) => ({
        id: gv.id,
        fromId: gv.fromId,
        toId: gv.toId,
        status: gv.status,
        deadline: gv.deadline,
        icon: g.notes[gv.noteId].icon,
        noteId: gv.fromId === pid ? gv.noteId : undefined,
      })),
    allies: alliesOf(state, pid),
    allianceRequests: c.alliances
      .filter((a) => a.status === 'pending' && (a.fromId === pid || a.toId === pid))
      .map((a) => ({ id: a.id, fromId: a.fromId, toId: a.toId, deadline: a.deadline })),
    alliancesEnabled: alliancesEnabled(n),
    statements: c.statements,
    statementOptions: { suspectAllowed: suspectStatementAllowed(n), spots: [...state.pack.socialSpots, ...state.pack.solitarySpots] },
    marks: c.marks[pid],
    pins: c.pins[pid],
    accusation: c.accusations[pid] ? { targetId: c.accusations[pid].targetId, stake: c.accusations[pid].stake } : undefined,
    done: !!c.done[pid],
    questions: state.pack.questions,
    lockedNoteIds: [...locked].filter((id) => c.hands[pid].includes(id)),
  };
}

/** Dev-only god view for the spectator screen: everything, including hidden truth. */
export function spectatorView(state: GameState, now: number) {
  const c = state.current;
  return {
    code: state.code,
    phase: state.phase,
    serverNow: now,
    round: state.round,
    roundEndsAt: state.roundEndsAt,
    caseIndex: state.caseIndex,
    settings: state.settings,
    players: state.players,
    results: state.results,
    case: c
      ? {
          killerId: c.gen.killerId,
          accompliceIds: c.gen.accompliceIds,
          patsyId: c.gen.patsyId,
          evidenceDims: c.gen.evidenceDims,
          cards: c.gen.cards,
          hands: Object.fromEntries(Object.entries(c.hands).map(([k, v]) => [k, v.map((id) => c.gen.notes[id])])),
          announcements: c.announcements.map((id) => c.gen.notes[id]),
          accusations: c.accusations,
          alliances: c.alliances.filter((a) => a.status === 'done').map((a) => [a.fromId, a.toId]),
          liesLeft: c.liesLeft,
          log: c.log.slice(-80),
          result: c.result,
        }
      : undefined,
  };
}

export type SpectatorView = ReturnType<typeof spectatorView>;
