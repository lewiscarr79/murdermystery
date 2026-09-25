// The redacted per-player view the server sends to each client (and bots read).
import type {
  AnswerMode,
  BotLevel,
  CharacterCard,
  Mark,
  NoteView,
  QuestionDim,
  Role,
  RoundId,
  Stake,
  Statement,
  TraitDim,
} from './types.ts';

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  score: number;
}

export interface CaseResultView {
  caseIndex: number;
  practice?: boolean;
  killerId: string;
  accompliceIds: string[];
  patsyId: string;
  cards: Record<string, CharacterCard>;
  accusations: Record<string, { targetId: string; stake: Stake } | null>;
  correctIds: string[];
  forgeryTrails: { noteId: string; text: string; holders: string[]; endedWith: string }[];
  hiddenEvidence: { holderId: string; text: string }[];
  lies: { by: string; to: string; dim: QuestionDim; claimed: string; truth: string; exposed: boolean }[];
  alliances: [string, string][];
  scores: Record<string, { total: number; lines: { label: string; points: number }[] }>;
  detectiveAccuracy: number;
}

export interface CaseView {
  intro: string;
  card: CharacterCard;
  role: Role;
  /** Name + job of every player's character (public). */
  cast: Record<string, { name: string; job: string }>;
  killerBriefing?: {
    killerId: string;
    accompliceIds: string[];
    patsyId: string;
    dangerousDims: TraitDim[];
    tipOff: { dim: TraitDim; playerId: string }[];
  };
  hand: NoteView[];
  seen: NoteView[];
  announcements: NoteView[];
  liesLeft: number;
  lieOptions: Record<QuestionDim, string[]>;
  left: { questions: number; requests: number; shows: number; statements: number };
  busy: string[];
  asked: { id: string; targetId: string; dim: QuestionDim; round: RoundId; answer?: { mode: AnswerMode; value?: string } }[];
  incoming: { id: string; askerId: string; dim: QuestionDim; question: string }[];
  swaps: {
    id: string;
    kind: 'request' | 'forced';
    members: string[];
    status: string;
    myPick?: string;
    iAmRequester: boolean;
  }[];
  gives: { id: string; fromId: string; toId: string; status: string; icon?: string; noteId?: string }[];
  allies: string[];
  allianceRequests: { id: string; fromId: string; toId: string }[];
  alliancesEnabled: boolean;
  statements: Statement[];
  statementOptions: { suspectAllowed: boolean; spots: string[] };
  marks: Record<string, Mark>;
  pins: string[];
  accusation?: { targetId: string; stake: Stake };
  /** Tapped "I'm finished" this round. */
  ready: boolean;
  /** Main step, or the end-of-round step (statement + alliance). */
  stage: 'main' | 'wrap';
  /** Ready and nothing is waiting on me. */
  finished: boolean;
  questions: Record<QuestionDim, string>;
  lockedNoteIds: string[];
}

export interface PlayerView {
  you: string;
  code: string;
  hostId: string;
  phase: 'lobby' | 'starting' | 'playing' | 'over';
  startsAt?: number;
  serverNow: number;
  players: PublicPlayer[];
  settings: { cases: number; practice: boolean };
  caseIndex: number;
  totalCases: number;
  /** The current case is the guided practice case. */
  practice: boolean;
  round?: RoundId;
  roundIndex?: number;
  /** Everyone the round is still waiting on, with a vague public reason. */
  waitingOn: { playerId: string; reason: string }[];
  case?: CaseView;
  lastResult?: CaseResultView;
  results: CaseResultView[];
}
