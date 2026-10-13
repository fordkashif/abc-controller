import type { AnswerCategory } from './answerValidation';

export * from './answerValidation';
export * from './letterSelector';
export * from './scoring';
export * from './types';

export const ANSWER_KEYS: AnswerCategory[] = ['boy', 'girl', 'animal', 'place', 'food', 'thing'];

export const CATEGORY_LABELS: Record<AnswerCategory, string> = {
  boy: 'Boy Name',
  girl: 'Girl Name',
  animal: 'Animal',
  place: 'Place',
  food: 'Food',
  thing: 'Thing',
};

/** Points for an accepted answer, split by how many players gave the same one. */
export function pointsForCount(sharedCount: number) {
  if (sharedCount <= 1) return 100;
  if (sharedCount === 2) return 50;
  if (sharedCount === 3) return 33;
  return 25;
}
