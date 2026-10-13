import {
  answerReviewKey,
  isObviousGarbageAnswer,
  isValidCategoryAnswer,
  normalizeAnswer,
  type AnswerCategory,
} from './answerValidation';
import type { Answers } from './types';

export type AnswerTone = 'blank' | 'accepted' | 'rejected';

export type AnswerReview = {
  /** Short label shown under the answer on the TV and phones. */
  label: string;
  tone: AnswerTone;
  /** Whether the answer scores points. */
  valid: boolean;
  /** True when the answer is in the built-in word list. Display only; never required to score. */
  verified: boolean;
};

type ReviewContext = {
  currentLetter: string;
  answerOverrides?: Record<string, boolean>;
};

const ANSWER_KEYS: AnswerCategory[] = ['boy', 'girl', 'animal', 'place', 'food', 'thing'];

/**
 * The single rule for whether an answer counts. Used by the scorer and by every
 * results screen so what players see always matches the points they get.
 *
 * Any answer that starts with the round's letter and isn't obvious junk counts.
 * The word lists are too small to be a gate (most real names and places aren't
 * in them), so they only mark an answer as verified. The dealer can still
 * reject or accept any answer by hand, and that always wins.
 */
export function reviewAnswer(
  context: ReviewContext,
  playerId: string,
  category: AnswerCategory,
  rawAnswer: string,
): AnswerReview {
  const answer = (rawAnswer ?? '').trim();
  if (!answer) return { label: 'Blank', tone: 'blank', valid: false, verified: false };

  const letter = (context.currentLetter ?? '').toUpperCase();
  const verified = isValidCategoryAnswer(category, answer, letter);

  const override = context.answerOverrides?.[answerReviewKey(playerId, category)];
  if (override === true) return { label: 'Accepted', tone: 'accepted', valid: true, verified };
  if (override === false) return { label: 'Rejected', tone: 'rejected', valid: false, verified };

  const firstLetter = normalizeAnswer(answer)[0]?.toUpperCase();
  if (firstLetter !== letter) return { label: 'Wrong letter', tone: 'rejected', valid: false, verified: false };

  if (isObviousGarbageAnswer(answer)) return { label: 'Not counted', tone: 'rejected', valid: false, verified: false };

  return { label: 'Accepted', tone: 'accepted', valid: true, verified };
}

export type PlayerAnswers = { id: string; answers?: Partial<Answers> };

/**
 * Round points per player id. Valid answers score 100, split when several
 * players give the same answer in the same category (see pointsForCount).
 */
export function scoreRoundAnswers(
  context: ReviewContext,
  players: PlayerAnswers[],
  pointsForCount: (sharedCount: number) => number,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const validKeys: Record<string, string[]> = {};

  for (const player of players) {
    validKeys[player.id] = [];
    for (const category of ANSWER_KEYS) {
      const raw = player.answers?.[category] ?? '';
      if (!reviewAnswer(context, player.id, category, raw).valid) continue;
      const key = `${category}:${normalizeAnswer(raw)}`;
      counts[key] = (counts[key] ?? 0) + 1;
      validKeys[player.id].push(key);
    }
  }

  const scores: Record<string, number> = {};
  for (const player of players) {
    scores[player.id] = validKeys[player.id].reduce((sum, key) => sum + pointsForCount(counts[key] ?? 1), 0);
  }
  return scores;
}
