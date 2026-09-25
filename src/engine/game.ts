// The authoritative game state machine. All functions are deterministic given (state, input, now):
// the server and the headless simulator drive the same code. State is mutated in place and
// transient events (flashes, toasts) are returned for the caller to deliver.
import {
  MAX_INCOMING_QUESTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  LIES_PER_CASE,
  PICK_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  REQUESTS_PER_TRADING_ROUND,
  ROUND_ACTIONS,
  ROUND_ORDER,
  SHOWS_PER_TRADING_ROUND,
  START_COUNTDOWN_MS,
  alliancesEnabled,
  isTradingRound,
  maxAllies,
  questionsPerRound,
  roundDurationMs,
  statementsPerRound,
  suspectStatementAllowed,
} from '../shared/rules.ts';
import type {
  Action,
  AnswerMode,
  BotLevel,
  Mark,
  Pace,
  QuestionDim,
  RoundId,
  Stake,
  Statement,
} from '../shared/types.ts';
import { generateCase, type GeneratedCase } from './caseGenerator.ts';
import { launchNight, type Pack } from './packs/launchNight.ts';
import { createRng } from './rng.ts';
import { assignRoles, emptyHistory, recordRoles, type RoleHistory } from './roles.ts';
import { scoreCase, type CaseResult } from './scoring.ts';

export interface PlayerInfo {
  id: string;
  name: string;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  score: number;
}

export interface Question {
  id: string;
  round: RoundId;
  askerId: string;
  targetId: string;
  dim: QuestionDim;
  askedAt: number;
  answer?: { mode: AnswerMode; value?: string; lied: boolean; at: number };
}

export type RequestStatus = 'pending' | 'picking' | 'done' | 'declined' | 'expired' | 'cancelled';

export interface SwapState {
  id: string;
  kind: 'request' | 'forced';
  /** Requester first. On resolution each member's pick goes to the next member (wrapping). */
  members: string[];
  status: RequestStatus;
  picks: Record<string, string>;
  deadline: number;
  round: RoundId;
  allyFree: boolean;
}

export interface GiveState {
  id: string;
  fromId: string;
  toId: string;
  noteId: string;
  status: RequestStatus;
  deadline: number;
}

export interface AllianceState {
  id: string;
  fromId: string;
  toId: string;
  status: RequestStatus;
  deadline: number;
}

export interface Counters {
  asked: number;
  requests: number;
  shows: number;
  statements: number;
}

export interface CaseState {
  gen: GeneratedCase;
  hands: Record<string, string[]>;
  seen: Record<string, string[]>;
  announcements: string[];
  questions: Question[];
  swaps: SwapState[];
  gives: GiveState[];
  alliances: AllianceState[];
  statements: Statement[];
  marks: Record<string, Record<string, Mark>>;
  pins: Record<string, string[]>;
  liesLeft: Record<string, number>;
  counters: Record<string, Counters>;
  done: Record<string, boolean>;
  accusations: Record<string, { targetId: string; stake: Stake; at: number }>;
  /** Holders of each note in order, for the reveal's forgery trails. */
  trails: Record<string, string[]>;
  log: { at: number; text: string }[];
  result?: CaseResult;
}

export interface Settings {
  cases: number;
  pace: Pace;
}

export interface GameState {
  code: string;
  hostId: string;
  pack: Pack;
  players: PlayerInfo[];
  settings: Settings;
  phase: 'lobby' | 'starting' | 'playing' | 'over';
  startsAt?: number;
  caseIndex: number;
  round?: RoundId;
  roundStartedAt?: number;
  roundEndsAt?: number;
  current?: CaseState;
  roleHistory: RoleHistory;
  recentPatsies: string[];
  results: CaseResult[];
  seed: number;
  seq: number;
}

export type GameEvent =
  | { type: 'flash'; to: string; noteId: string; text: string; fromName: string }
  | { type: 'toast'; to: string; text: string }
  | { type: 'round'; round: RoundId }
  | { type: 'gameOver' };

export type ActResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

const ok = (events: GameEvent[] = []): ActResult => ({ ok: true, events });
const fail = (error: string): ActResult => ({ ok: false, error });

export function createGame(code: string, host: { id: string; name: string }, seed: number): GameState {
  return {
    code,
    hostId: host.id,
    pack: launchNight,
    players: [{ id: host.id, name: host.name, isBot: false, connected: true, score: 0 }],
    settings: { cases: 3, pace: 'standard' },
    phase: 'lobby',
    caseIndex: 0,
    roleHistory: {},
    recentPatsies: [],
    results: [],
    seed,
    seq: 0,
  };
}

export function addPlayer(state: GameState, p: { id: string; name: string; isBot?: boolean; botLevel?: BotLevel }): ActResult {
  if (state.phase !== 'lobby') return fail('The game has already started');
  if (state.players.length >= MAX_PLAYERS) return fail('The room is full');
  if (state.players.some((x) => x.id === p.id)) return fail('Already joined');
  const name = uniqueName(state, p.name.trim().slice(0, 16) || 'Player');
  state.players.push({ id: p.id, name, isBot: !!p.isBot, botLevel: p.botLevel, connected: true, score: 0 });
  return ok();
}

function uniqueName(state: GameState, name: string): string {
  let out = name;
  let i = 2;
  while (state.players.some((p) => p.name.toLowerCase() === out.toLowerCase())) out = `${name} ${i++}`;
  return out;
}

export function removePlayer(state: GameState, id: string): ActResult {
  if (state.phase !== 'lobby') return fail('Players can only be removed in the lobby');
  state.players = state.players.filter((p) => p.id !== id);
  if (state.hostId === id) {
    const nextHost = state.players.find((p) => !p.isBot);
    if (nextHost) state.hostId = nextHost.id;
  }
  return ok();
}

export function updateSettings(state: GameState, settings: Partial<Settings>): ActResult {
  if (state.phase !== 'lobby') return fail('Settings are locked once the game starts');
  if (settings.cases !== undefined) state.settings.cases = Math.max(1, Math.min(5, Math.round(settings.cases)));
  if (settings.pace) state.settings.pace = settings.pace;
  return ok();
}

export function startGame(state: GameState, now: number): ActResult {
  if (state.phase !== 'lobby') return fail('Already started');
  if (state.players.length < MIN_PLAYERS) return fail(`Need at least ${MIN_PLAYERS} players (add bots to fill seats)`);
  state.phase = 'starting';
  state.startsAt = now + START_COUNTDOWN_MS;
  state.roleHistory = emptyHistory(state.players.map((p) => p.id));
  return ok();
}

/** Earliest time at which tick() has work to do. */
export function nextDeadline(state: GameState): number | null {
  if (state.phase === 'starting') return state.startsAt ?? null;
  if (state.phase !== 'playing' || !state.current) return null;
  const times = [state.roundEndsAt ?? Infinity];
  for (const s of state.current.swaps) if (s.status === 'pending' || s.status === 'picking') times.push(s.deadline);
  for (const g of state.current.gives) if (g.status === 'pending') times.push(g.deadline);
  for (const a of state.current.alliances) if (a.status === 'pending') times.push(a.deadline);
  const t = Math.min(...times);
  return Number.isFinite(t) ? t : null;
}

export function tick(state: GameState, now: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase === 'starting' && state.startsAt !== undefined && now >= state.startsAt) {
    state.phase = 'playing';
    beginCase(state, state.startsAt, events);
  }
  if (state.phase !== 'playing' || !state.current) return events;
  expireRequests(state, now, events);
  if (state.roundEndsAt !== undefined && now >= state.roundEndsAt) advanceRound(state, state.roundEndsAt, events);
  else if (allDone(state)) advanceRound(state, now, events);
  return events;
}

function participants(state: GameState): PlayerInfo[] {
  return state.players.filter((p) => p.isBot || p.connected);
}

function allDone(state: GameState): boolean {
  const c = state.current!;
  const active = participants(state);
  return active.length > 0 && active.every((p) => c.done[p.id]);
}

function nid(state: GameState, prefix: string): string {
  state.seq += 1;
  return `${prefix}${state.seq}`;
}

function name(state: GameState, id: string): string {
  return state.current?.gen.cards[id]?.name ?? state.players.find((p) => p.id === id)?.name ?? '?';
}

function log(state: GameState, now: number, text: string) {
  state.current?.log.push({ at: now, text });
}

function beginCase(state: GameState, now: number, events: GameEvent[]) {
  const ids = state.players.map((p) => p.id);
  const rng = createRng(state.seed + state.caseIndex * 7919);
  const roles = assignRoles(ids, state.roleHistory, rng);
  const gen = generateCase({
    pack: state.pack,
    playerIds: ids,
    roles,
    seed: state.seed + state.caseIndex * 104729 + 1,
    avoidPatsy: state.recentPatsies,
  });
  recordRoles(state.roleHistory, roles, gen.patsyId);
  state.recentPatsies = [gen.patsyId, ...state.recentPatsies].slice(0, Math.max(1, Math.floor(ids.length / 2)));
  const perPlayer = <T>(f: () => T) => Object.fromEntries(ids.map((id) => [id, f()]));
  state.current = {
    gen,
    hands: perPlayer(() => [] as string[]),
    seen: perPlayer(() => [] as string[]),
    announcements: [],
    questions: [],
    swaps: [],
    gives: [],
    alliances: [],
    statements: [],
    marks: perPlayer(() => ({})),
    pins: perPlayer(() => [] as string[]),
    liesLeft: perPlayer(() => LIES_PER_CASE),
    counters: perPlayer(freshCounters),
    done: {},
    accusations: {},
    trails: {},
    log: [],
  };
  log(state, now, `Case ${state.caseIndex + 1}: killer ${name(state, gen.killerId)}, Patsy ${name(state, gen.patsyId)}`);
  enterRound(state, 'briefing', now, events);
}

function freshCounters(): Counters {
  return { asked: 0, requests: 0, shows: 0, statements: 0 };
}

function enterRound(state: GameState, round: RoundId, now: number, events: GameEvent[]) {
  const c = state.current!;
  state.round = round;
  state.roundStartedAt = now;
  state.roundEndsAt = now + roundDurationMs(round, state.settings.pace, state.players.length);
  c.done = {};
  for (const id of Object.keys(c.counters)) c.counters[id] = freshCounters();
  events.push({ type: 'round', round });
  log(state, now, `— ${round} —`);

  if (round === 'evidence' || round === 'evidence2') {
    const deal = round === 'evidence' ? c.gen.deal.evidence : c.gen.deal.evidence2;
    for (const [pid, noteIds] of Object.entries(deal)) {
      for (const n of noteIds) {
        c.hands[pid].push(n);
        c.trails[n] = [pid];
      }
    }
    c.announcements.push(round === 'evidence' ? c.gen.announcements.evidence : c.gen.announcements.evidence2);
  }
  if (isTradingRound(round)) createForcedSwaps(state, now);
  if (round === 'reveal') {
    c.result = scoreCase(state);
    for (const p of state.players) p.score += c.result.scores[p.id]?.total ?? 0;
    state.results.push(c.result);
  }
}

function createForcedSwaps(state: GameState, now: number) {
  const c = state.current!;
  const rng = createRng(state.seed + state.caseIndex * 31 + ROUND_ORDER.indexOf(state.round!) * 977);
  const ids = rng.shuffle(state.players.map((p) => p.id).filter((id) => c.hands[id].length > 0));
  const groups: string[][] = [];
  while (ids.length >= 2) {
    if (ids.length === 3) groups.push(ids.splice(0, 3));
    else groups.push(ids.splice(0, 2));
  }
  for (const members of groups) {
    c.swaps.push({
      id: nid(state, 's'),
      kind: 'forced',
      members,
      status: 'picking',
      picks: {},
      deadline: now + PICK_TIMEOUT_MS,
      round: state.round!,
      allyFree: true,
    });
  }
}

function advanceRound(state: GameState, now: number, events: GameEvent[]) {
  const c = state.current!;
  const round = state.round!;
  // Close out the round: unanswered questions become "No comment", pending requests lapse.
  for (const q of c.questions) {
    if (q.round === round && !q.answer) q.answer = { mode: 'nocomment', lied: false, at: now };
  }
  for (const s of c.swaps) {
    if (s.status === 'pending') s.status = 'expired';
    if (s.status === 'picking') resolveOrLapseSwap(state, s, now, events, true);
  }
  for (const g of c.gives) if (g.status === 'pending') g.status = 'expired';
  for (const a of c.alliances) if (a.status === 'pending') a.status = 'expired';

  const idx = ROUND_ORDER.indexOf(round);
  if (idx < ROUND_ORDER.length - 1) {
    enterRound(state, ROUND_ORDER[idx + 1], now, events);
    return;
  }
  // End of reveal.
  state.caseIndex += 1;
  if (state.caseIndex >= state.settings.cases) {
    state.phase = 'over';
    state.round = undefined;
    state.roundEndsAt = undefined;
    events.push({ type: 'gameOver' });
  } else {
    beginCase(state, now, events);
  }
}

function expireRequests(state: GameState, now: number, events: GameEvent[]) {
  const c = state.current!;
  for (const s of c.swaps) {
    if (s.status === 'pending' && now >= s.deadline) {
      s.status = 'expired';
      events.push({ type: 'toast', to: s.members[0], text: `${name(state, s.members[1])} didn't respond to your swap.` });
    } else if (s.status === 'picking' && now >= s.deadline) {
      resolveOrLapseSwap(state, s, now, events, false);
    }
  }
  for (const g of c.gives) {
    if (g.status === 'pending' && now >= g.deadline) g.status = 'expired';
  }
  for (const a of c.alliances) {
    if (a.status === 'pending' && now >= a.deadline) a.status = 'expired';
  }
}

/** Picking deadline passed: forced swaps auto-pick a random note; requested swaps are cancelled. */
function resolveOrLapseSwap(state: GameState, s: SwapState, now: number, events: GameEvent[], roundEnding: boolean) {
  const c = state.current!;
  if (s.kind === 'forced') {
    const rng = createRng(state.seed + state.seq * 13 + now);
    for (const m of s.members) {
      if (!s.picks[m]) {
        const free = c.hands[m].filter((n) => !lockedNotes(state).has(n));
        if (free.length) s.picks[m] = rng.pick(free);
      }
    }
    if (s.members.every((m) => s.picks[m])) {
      completeSwap(state, s, now, events);
      return;
    }
  }
  s.status = 'cancelled';
  const missing = s.members.filter((m) => !s.picks[m]);
  for (const m of s.members) {
    if (!missing.includes(m)) {
      events.push({
        type: 'toast',
        to: m,
        text: roundEnding ? 'Swap cancelled: time ran out.' : `Swap cancelled: ${missing.map((x) => name(state, x)).join(', ')} backed out.`,
      });
    }
  }
}

function lockedNotes(state: GameState): Set<string> {
  const c = state.current!;
  const locked = new Set<string>();
  for (const s of c.swaps) if (s.status === 'picking') Object.values(s.picks).forEach((n) => locked.add(n));
  for (const g of c.gives) if (g.status === 'pending') locked.add(g.noteId);
  return locked;
}

function moveNote(state: GameState, noteId: string, from: string, to: string) {
  const c = state.current!;
  c.hands[from] = c.hands[from].filter((n) => n !== noteId);
  if (!c.seen[from].includes(noteId)) c.seen[from].push(noteId);
  c.hands[to].push(noteId);
  c.seen[to] = c.seen[to].filter((n) => n !== noteId);
  (c.trails[noteId] ??= []).push(to);
}

function completeSwap(state: GameState, s: SwapState, now: number, events: GameEvent[]) {
  const m = s.members;
  for (let i = 0; i < m.length; i++) moveNote(state, s.picks[m[i]], m[i], m[(i + 1) % m.length]);
  s.status = 'done';
  for (let i = 0; i < m.length; i++) {
    const from = m[(i - 1 + m.length) % m.length];
    events.push({ type: 'toast', to: m[i], text: `Swap complete — you received a note from ${name(state, from)}.` });
  }
  log(state, now, `${s.kind === 'forced' ? 'Forced swap' : 'Swap'}: ${m.map((x) => name(state, x)).join(' → ')}`);
}

function hasPendingOutgoing(state: GameState, pid: string): boolean {
  const c = state.current!;
  return (
    c.swaps.some((s) => s.kind === 'request' && s.members[0] === pid && s.status === 'pending') ||
    c.gives.some((g) => g.fromId === pid && g.status === 'pending')
  );
}

export function alliesOf(state: GameState, pid: string): string[] {
  const c = state.current;
  if (!c) return [];
  return c.alliances
    .filter((a) => a.status === 'done' && (a.fromId === pid || a.toId === pid))
    .map((a) => (a.fromId === pid ? a.toId : a.fromId));
}

export function incomingQuestionsThisRound(state: GameState, pid: string): number {
  const c = state.current;
  if (!c || !state.round) return 0;
  return c.questions.filter((q) => q.round === state.round && q.targetId === pid).length;
}

export function act(state: GameState, pid: string, action: Action, now: number): ActResult {
  if (state.phase !== 'playing' || !state.current || !state.round) return fail('No round in progress');
  if (!state.players.some((p) => p.id === pid)) return fail('Unknown player');
  if (state.roundEndsAt !== undefined && now > state.roundEndsAt) return fail('Too late — the round has ended');
  if (!ROUND_ACTIONS[state.round].includes(action.type)) return fail(`You can't do that in this round`);
  const c = state.current;
  const n = state.players.length;
  const isPlayer = (id: string | undefined) => !!id && id !== pid && state.players.some((p) => p.id === id);
  const counters = c.counters[pid];

  switch (action.type) {
    case 'done':
      c.done[pid] = true;
      return ok();

    case 'mark':
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      if (action.mark) c.marks[pid][action.targetId] = action.mark;
      else delete c.marks[pid][action.targetId];
      return ok();

    case 'pin': {
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      const pins = c.pins[pid].filter((x) => x !== action.targetId);
      if (action.pinned) {
        if (pins.length >= 6) return fail('You can pin up to 6 suspects');
        pins.push(action.targetId);
      }
      c.pins[pid] = pins;
      return ok();
    }

    case 'ask': {
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      if (counters.asked >= questionsPerRound(n)) return fail('No questions left this round');
      if (incomingQuestionsThisRound(state, action.targetId) >= MAX_INCOMING_QUESTIONS) return fail('That player is busy');
      if (c.questions.some((q) => q.askerId === pid && q.targetId === action.targetId && q.dim === action.dim)) {
        return fail('You already asked them that');
      }
      counters.asked += 1;
      const q: Question = { id: nid(state, 'q'), round: state.round, askerId: pid, targetId: action.targetId, dim: action.dim, askedAt: now };
      c.questions.push(q);
      return ok([{ type: 'toast', to: action.targetId, text: `${name(state, pid)} has a question for you.` }]);
    }

    case 'answer': {
      const q = c.questions.find((x) => x.id === action.questionId);
      if (!q || q.targetId !== pid) return fail('No such question');
      if (q.answer) return fail('Already answered');
      const card = c.gen.cards[pid];
      const truth = q.dim === 'location' ? card.location : card.traits[q.dim];
      if (action.mode === 'lie') {
        if (c.liesLeft[pid] <= 0) return fail('No lies left');
        if (!action.lieValue || !c.gen.lieOptions[pid][q.dim].includes(action.lieValue)) return fail('Pick one of the offered lies');
        c.liesLeft[pid] -= 1;
        q.answer = { mode: 'lie', value: action.lieValue, lied: true, at: now };
      } else if (action.mode === 'truth') {
        q.answer = { mode: 'truth', value: truth, lied: false, at: now };
      } else {
        q.answer = { mode: 'nocomment', lied: false, at: now };
      }
      log(state, now, `${name(state, pid)} → ${name(state, q.askerId)} (${q.dim}): ${q.answer.value ?? 'No comment'}${q.answer.lied ? ' [LIE]' : ''}`);
      return ok([{ type: 'toast', to: q.askerId, text: `${name(state, pid)} answered your question.` }]);
    }

    case 'requestSwap': {
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      const allyFree = alliesOf(state, pid).includes(action.targetId);
      if (!allyFree && counters.requests >= REQUESTS_PER_TRADING_ROUND) return fail('No swap requests left this round');
      if (hasPendingOutgoing(state, pid)) return fail('Wait for your current request to be answered');
      if (!c.hands[pid].length || !c.hands[action.targetId].length) return fail('Both players need a note to swap');
      if (!allyFree) counters.requests += 1;
      c.swaps.push({
        id: nid(state, 's'),
        kind: 'request',
        members: [pid, action.targetId],
        status: 'pending',
        picks: {},
        deadline: now + REQUEST_TIMEOUT_MS,
        round: state.round,
        allyFree,
      });
      return ok([{ type: 'toast', to: action.targetId, text: `${name(state, pid)} wants to swap evidence.` }]);
    }

    case 'respondSwap': {
      const s = c.swaps.find((x) => x.id === action.swapId);
      if (!s || s.kind !== 'request' || s.members[1] !== pid || s.status !== 'pending') return fail('No such swap request');
      if (!action.accept) {
        s.status = 'declined';
        return ok([{ type: 'toast', to: s.members[0], text: `${name(state, pid)} declined your swap.` }]);
      }
      s.status = 'picking';
      s.deadline = now + PICK_TIMEOUT_MS;
      return ok([{ type: 'toast', to: s.members[0], text: `${name(state, pid)} accepted — pick a note to give.` }]);
    }

    case 'pickSwap': {
      const s = c.swaps.find((x) => x.id === action.swapId);
      if (!s || s.status !== 'picking' || !s.members.includes(pid)) return fail('No swap to pick for');
      if (s.picks[pid]) return fail('Already picked');
      if (!c.hands[pid].includes(action.noteId)) return fail("That note isn't in your hand");
      if (lockedNotes(state).has(action.noteId)) return fail('That note is already committed elsewhere');
      s.picks[pid] = action.noteId;
      if (s.members.every((m) => s.picks[m])) {
        const events: GameEvent[] = [];
        completeSwap(state, s, now, events);
        return ok(events);
      }
      return ok();
    }

    case 'give': {
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      if (counters.requests >= REQUESTS_PER_TRADING_ROUND) return fail('No requests left this round');
      if (hasPendingOutgoing(state, pid)) return fail('Wait for your current request to be answered');
      if (!c.hands[pid].includes(action.noteId)) return fail("That note isn't in your hand");
      if (lockedNotes(state).has(action.noteId)) return fail('That note is already committed elsewhere');
      counters.requests += 1;
      c.gives.push({ id: nid(state, 'g'), fromId: pid, toId: action.targetId, noteId: action.noteId, status: 'pending', deadline: now + REQUEST_TIMEOUT_MS });
      return ok([{ type: 'toast', to: action.targetId, text: `${name(state, pid)} wants to give you a note.` }]);
    }

    case 'respondGive': {
      const g = c.gives.find((x) => x.id === action.giveId);
      if (!g || g.toId !== pid || g.status !== 'pending') return fail('No such offer');
      if (!action.accept) {
        g.status = 'declined';
        return ok([{ type: 'toast', to: g.fromId, text: `${name(state, pid)} declined your note.` }]);
      }
      if (!c.hands[g.fromId].includes(g.noteId)) {
        g.status = 'cancelled';
        return fail('That note is no longer available');
      }
      g.status = 'done';
      moveNote(state, g.noteId, g.fromId, pid);
      log(state, now, `Give: ${name(state, g.fromId)} → ${name(state, pid)}`);
      return ok([{ type: 'toast', to: g.fromId, text: `${name(state, pid)} accepted your note.` }]);
    }

    case 'show': {
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      if (counters.shows >= SHOWS_PER_TRADING_ROUND) return fail('No shows left this round');
      if (!c.hands[pid].includes(action.noteId)) return fail("That note isn't in your hand");
      counters.shows += 1;
      const t = action.targetId;
      if (!c.hands[t].includes(action.noteId) && !c.seen[t].includes(action.noteId)) c.seen[t].push(action.noteId);
      const note = c.gen.notes[action.noteId];
      log(state, now, `Show: ${name(state, pid)} → ${name(state, t)}`);
      return ok([{ type: 'flash', to: t, noteId: note.id, text: note.text, fromName: name(state, pid) }]);
    }

    case 'proposeAlliance': {
      if (!alliancesEnabled(n)) return fail('Alliances start at 5 players');
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      const limit = maxAllies(n);
      if (alliesOf(state, pid).length >= limit) return fail('You already have the maximum allies');
      if (alliesOf(state, action.targetId).length >= limit) return fail('They already have the maximum allies');
      const existing = c.alliances.some(
        (a) =>
          (a.status === 'pending' || a.status === 'done') &&
          ((a.fromId === pid && a.toId === action.targetId) || (a.fromId === action.targetId && a.toId === pid)),
      );
      if (existing) return fail('Already allied or pending');
      c.alliances.push({ id: nid(state, 'a'), fromId: pid, toId: action.targetId, status: 'pending', deadline: now + REQUEST_TIMEOUT_MS });
      return ok([{ type: 'toast', to: action.targetId, text: `${name(state, pid)} proposes a secret alliance.` }]);
    }

    case 'respondAlliance': {
      const a = c.alliances.find((x) => x.id === action.allianceId);
      if (!a || a.toId !== pid || a.status !== 'pending') return fail('No such proposal');
      if (!action.accept) {
        a.status = 'declined';
        return ok([{ type: 'toast', to: a.fromId, text: `${name(state, pid)} declined your alliance.` }]);
      }
      const limit = maxAllies(n);
      if (alliesOf(state, pid).length >= limit || alliesOf(state, a.fromId).length >= limit) {
        a.status = 'cancelled';
        return fail('Ally limit reached');
      }
      a.status = 'done';
      log(state, now, `Alliance: ${name(state, a.fromId)} + ${name(state, pid)}`);
      return ok([{ type: 'toast', to: a.fromId, text: `${name(state, pid)} is now your secret ally.` }]);
    }

    case 'statement': {
      if (counters.statements >= statementsPerRound(n)) return fail('No statements left this round');
      const t = action.statementType;
      if (t === 'suspect' && !suspectStatementAllowed(n)) return fail('"I suspect" is off in big games');
      if (t === 'wasAt') {
        const spots = [...state.pack.socialSpots, ...state.pack.solitarySpots];
        if (!action.value || !spots.includes(action.value)) return fail('Pick a place');
      } else if (!isPlayer(action.targetId)) return fail('Pick another player');
      counters.statements += 1;
      c.statements.push({ id: nid(state, 'm'), by: pid, type: t, targetId: action.targetId, value: action.value, round: state.round });
      return ok();
    }

    case 'accuse': {
      if (!isPlayer(action.targetId)) return fail('Pick another player');
      if (c.accusations[pid]) return fail('Your accusation is locked in');
      c.accusations[pid] = { targetId: action.targetId, stake: action.stake, at: now };
      c.done[pid] = true;
      return ok();
    }
  }
}

/** Host skips the reveal (or any round) early. */
export function hostAdvance(state: GameState, pid: string, now: number): ActResult {
  if (pid !== state.hostId) return fail('Only the host can do that');
  if (state.phase !== 'playing' || !state.current) return fail('No round in progress');
  const events: GameEvent[] = [];
  advanceRound(state, now, events);
  return ok(events);
}

export function setConnected(state: GameState, pid: string, connected: boolean) {
  const p = state.players.find((x) => x.id === pid);
  if (p) p.connected = connected;
}
