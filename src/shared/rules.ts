// Size-scaled rule constants. Every number the rulebook mentions lives here.
import type { ActionType, RoundId } from './types.ts';

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
  briefing: { title: 'Briefing', hint: 'Meet your character and find out your role.' },
  evidence: { title: 'Evidence', hint: 'Your first clues have arrived. They describe the killer.' },
  questioning: { title: 'Questioning', hint: 'Ask other players about themselves to see who matches the clues.' },
  trading: { title: 'Trading', hint: 'Swap notes to get more clues. Careful: the killer is trading too.' },
  evidence2: { title: 'New Evidence', hint: 'More clues are in. Ask your last questions.' },
  finalTrades: { title: 'Final Trades', hint: 'Last chance to swap notes before you accuse.' },
  accusation: { title: 'Accusation', hint: 'Name the killer: Sure or Hunch?' },
  reveal: { title: 'Reveal', hint: 'Who did it?' },
};

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
  'cancelRequest',
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
