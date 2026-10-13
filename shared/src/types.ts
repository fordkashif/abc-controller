import type { AnswerCategory } from './answerValidation';

/** Firestore timestamp shape, kept structural so both apps can share it without importing firebase here. */
export type TimestampLike = { toMillis: () => number };

export type RoomStatus = 'waiting' | 'playing' | 'paused' | 'round_ended' | 'finished';

export type RoomRecord = {
  code: string;
  status: RoomStatus;
  hostId: string;
  currentDealerId: string;
  currentLetter: string;
  roundNumber: number;
  settings: { rounds: number; timer: number };
  letterHistory?: string[];
  /** Keyed by answerReviewKey(playerId, category). true = accepted, false = rejected. */
  answerOverrides?: Record<string, boolean>;
  roundStartedAt?: TimestampLike | null;
  roundCloseRequestedAt?: TimestampLike | null;
  pausedRemainingSec?: number | null;
  createdAt?: TimestampLike;
  /** The TV's heartbeat. While fresh, the TV referees the room; otherwise the dealer's phone does. */
  hostSeenAt?: TimestampLike | null;
};

export type Answers = Record<AnswerCategory, string>;

export type PlayerRecord = {
  name: string;
  avatarId?: string;
  photoURL?: string;
  ready?: boolean;
  isDealer: boolean;
  connectionState?: 'lobby' | 'playing' | 'results' | 'left';
  joinedAt?: TimestampLike;
  lastSeenAt?: TimestampLike;
  leftAt?: TimestampLike | null;
  score: number;
  roundScore?: number;
  scoredRound?: number;
  roundReady?: boolean;
  submitted: boolean;
  /** Missing until the player's first round starts. */
  answers?: Answers;
  /** Round the saved answers belong to. Answers tagged with another round are ignored. */
  answersRound?: number;
};
