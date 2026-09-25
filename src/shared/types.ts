// Shared domain types used by the engine, server, bots and client.

export type TraitDim = 'coat' | 'arrival' | 'drink' | 'phone' | 'team';
export type QuestionDim = TraitDim | 'location';

export const TRAIT_DIMS: TraitDim[] = ['coat', 'arrival', 'drink', 'phone', 'team'];
export const QUESTION_DIMS: QuestionDim[] = ['coat', 'arrival', 'location', 'drink', 'phone', 'team'];

export type Traits = Record<TraitDim, string>;

export type Role = 'killer' | 'accomplice' | 'detective';

export type RoundId =
  | 'briefing'
  | 'evidence'
  | 'questioning'
  | 'trading'
  | 'evidence2'
  | 'finalTrades'
  | 'accusation'
  | 'reveal';

export type Pace = 'quick' | 'standard';
export type BotLevel = 'easy' | 'normal' | 'sharp';

/** What a note is "about". Forged notes carry exactly the same public fact shape as genuine ones. */
export type NoteFact =
  | { kind: 'killer'; dim: TraitDim; value: string }
  | { kind: 'record'; playerId: string; dim: QuestionDim; value: string }
  | { kind: 'alibi'; playerId: string };

export type NoteIcon = 'cctv' | 'receipt' | 'glass' | 'phone' | 'badge' | 'coat' | 'photo' | 'witness';

/** The public face of a note: what any holder may see. Never includes a source or a forged flag. */
export interface NoteView {
  id: string;
  text: string;
  icon: NoteIcon;
  fact: NoteFact;
}

/** Server-only note, including hidden truth. */
export interface Note extends NoteView {
  forged: boolean;
}

export type Mark = 'cleared' | 'suspicious' | 'liar';
export type Stake = 'sure' | 'hunch';
export type AnswerMode = 'truth' | 'lie' | 'nocomment';

export type StatementType = 'wasAt' | 'vouch' | 'lied' | 'suspect';

export interface Statement {
  id: string;
  by: string;
  type: StatementType;
  targetId?: string;
  value?: string;
  round: RoundId;
}

export type Action =
  | { type: 'done' }
  | { type: 'ask'; targetId: string; dim: QuestionDim }
  | { type: 'answer'; questionId: string; mode: AnswerMode; lieValue?: string }
  | { type: 'requestSwap'; targetId: string }
  | { type: 'respondSwap'; swapId: string; accept: boolean }
  | { type: 'pickSwap'; swapId: string; noteId: string }
  | { type: 'give'; targetId: string; noteId: string }
  | { type: 'respondGive'; giveId: string; accept: boolean }
  | { type: 'show'; targetId: string; noteId: string }
  | { type: 'proposeAlliance'; targetId: string }
  | { type: 'respondAlliance'; allianceId: string; accept: boolean }
  | { type: 'statement'; statementType: StatementType; targetId?: string; value?: string }
  | { type: 'mark'; targetId: string; mark: Mark | null }
  | { type: 'pin'; targetId: string; pinned: boolean }
  | { type: 'accuse'; targetId: string; stake: Stake };

export type ActionType = Action['type'];

export interface CharacterCard {
  playerId: string;
  name: string;
  job: string;
  traits: Traits;
  location: string;
  /** Other players at the same place at 21:30. Empty for solitary spots. */
  witnesses: string[];
}
