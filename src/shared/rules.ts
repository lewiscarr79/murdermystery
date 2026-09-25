// Size-scaled rule constants. Every number the rulebook mentions lives here.
import type { ActionType, Pace, RoundId } from './types.ts';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 22;

export const ROUND_ORDER: RoundId[] = [
  'briefing',
  'evidence',
  'questioning',
  'trading',
  'evidence2',
  'finalTrades',
  'accusation',
  'reveal',
];

export const ROUND_LABELS: Record<RoundId, { title: string; hint: string }> = {
  briefing: { title: 'Briefing', hint: 'Read your character card and your role.' },
  evidence: { title: 'Evidence', hint: 'Your first evidence notes have arrived. Study them.' },
  questioning: { title: 'Questioning', hint: 'Question other players. Answer truthfully… or not.' },
  trading: { title: 'Trading', hint: 'Swap, give or show notes. Careful: the killer is trading too.' },
  evidence2: { title: 'New Evidence', hint: 'Fresh evidence is in. Ask your remaining questions.' },
  finalTrades: { title: 'Final Trades', hint: 'Last chance to trade before accusations.' },
  accusation: { title: 'Accusation', hint: 'Name the killer. Sure or Hunch?' },
  reveal: { title: 'Reveal', hint: 'Who did it?' },
};

const DURATIONS: Record<Pace, Record<RoundId, number>> = {
  standard: {
    briefing: 30,
    evidence: 60,
    questioning: 90,
    trading: 90,
    evidence2: 90,
    finalTrades: 60,
    accusation: 45,
    reveal: 60,
  },
  quick: {
    briefing: 20,
    evidence: 45,
    questioning: 60,
    trading: 60,
    evidence2: 60,
    finalTrades: 45,
    accusation: 30,
    reveal: 45,
  },
};

const BIG_GAME_BONUS_ROUNDS: RoundId[] = ['questioning', 'trading', 'evidence2', 'finalTrades'];

/** Round duration in milliseconds. */
export function roundDurationMs(round: RoundId, pace: Pace, players: number): number {
  const base = DURATIONS[pace][round];
  const bonus = players >= 13 && BIG_GAME_BONUS_ROUNDS.includes(round) ? 15 : 0;
  return (base + bonus) * 1000;
}

const ALWAYS: ActionType[] = ['mark', 'pin', 'done'];
const QUESTIONING: ActionType[] = [...ALWAYS, 'ask', 'answer', 'statement'];
const TRADING: ActionType[] = [
  ...ALWAYS,
  'requestSwap',
  'respondSwap',
  'pickSwap',
  'give',
  'respondGive',
  'show',
  'proposeAlliance',
  'respondAlliance',
  'statement',
];

export const ROUND_ACTIONS: Record<RoundId, ActionType[]> = {
  briefing: ['done'],
  evidence: ALWAYS,
  questioning: QUESTIONING,
  trading: TRADING,
  evidence2: QUESTIONING,
  finalTrades: TRADING,
  accusation: [...ALWAYS, 'accuse'],
  reveal: ['done'],
};

export function isTradingRound(r: RoundId): boolean {
  return r === 'trading' || r === 'finalTrades';
}

export function isQuestionRound(r: RoundId): boolean {
  return r === 'questioning' || r === 'evidence2';
}

export function accompliceCount(n: number): number {
  if (n <= 5) return 0;
  if (n <= 12) return 1;
  return 2;
}

/** Total forged notes the killer's side holds. A lone killer holds 2. */
export function forgeryCount(n: number): number {
  const side = 1 + accompliceCount(n);
  return side === 1 ? 2 : side;
}

export function evidenceDimCount(n: number): number {
  return n >= 13 ? 5 : 4;
}

/** Genuine copies dealt per key killer trait. */
export function genuineCopies(n: number): number {
  if (n <= 9) return 2;
  if (n <= 16) return 3;
  return 4;
}

export const LIES_PER_CASE = 3;
export const MAX_INCOMING_QUESTIONS = 3;
export const REQUEST_TIMEOUT_MS = 20_000;
export const PICK_TIMEOUT_MS = 15_000;
export const SHOW_FLASH_MS = 5_000;
export const START_COUNTDOWN_MS = 3_000;

export function questionsPerRound(n: number): number {
  return n >= 10 ? 3 : 2;
}

export function statementsPerRound(n: number): number {
  if (n >= 10) return 1;
  if (n >= 7) return 2;
  return 3;
}

export function suspectStatementAllowed(n: number): boolean {
  return n < 10;
}

export const REQUESTS_PER_TRADING_ROUND = 2;
export const SHOWS_PER_TRADING_ROUND = 2;

export function alliancesEnabled(n: number): boolean {
  return n >= 5;
}

export function maxAllies(n: number): number {
  return n >= 13 ? 2 : 1;
}

export function privateNotesInEvidence2(n: number): number {
  return n <= 5 ? 2 : 1;
}

export const SCORING = {
  sureCorrect: 100,
  sureWrong: -30,
  hunchCorrect: 50,
  hunchWrong: 0,
  accusedAccomplice: 25,
  lieExposed: 15,
  allianceBothCorrect: 20,
  // Killer-side values were tuned down after bot simulations showed the killer topping almost every
  // case at the original values (150 base, +20/+10/+20/+30, cap 150), which made the leaderboard
  // depend on who drew the killer role.
  killerBase: 100,
  killerPerPatsyAccuser: 10,
  killerPerUnexposedLie: 5,
  killerPerForgeryHeld: 5,
  killerSideAllyWrong: 15,
  killerCap: 120,
  accompliceShare: 0.7,
  accompliceAccused: -25,
};
