import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsForCount } from './index';
import { reviewAnswer, scoreRoundAnswers } from './scoring';

const K = { currentLetter: 'K' };

test('real answers not in the word list now count', () => {
  for (const [category, answer] of [
    ['boy', 'Kashif'],
    ['place', 'Kingston'],
    ['place', 'Kellits'],
    ['food', 'Kidney beans'],
  ] as const) {
    const review = reviewAnswer(K, 'p1', category, answer);
    assert.equal(review.valid, true, `${answer} should count`);
    assert.equal(review.label, 'Accepted');
  }
});

test('word-list answers are marked verified, others are not', () => {
  assert.equal(reviewAnswer(K, 'p1', 'place', 'Kingston').verified, true);
  assert.equal(reviewAnswer(K, 'p1', 'boy', 'Kashif').verified, false);
});

test('wrong letter, blank and junk do not count', () => {
  assert.deepEqual(
    [reviewAnswer(K, 'p1', 'boy', 'Andre').label, reviewAnswer(K, 'p1', 'boy', 'Andre').valid],
    ['Wrong letter', false],
  );
  assert.equal(reviewAnswer(K, 'p1', 'boy', '   ').label, 'Blank');
  assert.equal(reviewAnswer(K, 'p1', 'thing', 'kkkk').valid, false);
  assert.equal(reviewAnswer({ currentLetter: 'N' }, 'p1', 'thing', 'nothing').valid, false);
  assert.equal(reviewAnswer(K, 'p1', 'thing', 'K').valid, false);
});

test('first letter ignores case, spaces, punctuation and accents', () => {
  assert.equal(reviewAnswer(K, 'p1', 'boy', '  kevin').valid, true);
  assert.equal(reviewAnswer({ currentLetter: 'E' }, 'p1', 'girl', 'Émilie').valid, true);
  assert.equal(reviewAnswer(K, 'p1', 'place', '"Kingston"').valid, true);
});

test('dealer overrides always win', () => {
  const room = { currentLetter: 'K', answerOverrides: { 'p1:boy': false, 'p2:boy': true } };
  assert.equal(reviewAnswer(room, 'p1', 'boy', 'Kevin').valid, false);
  assert.equal(reviewAnswer(room, 'p1', 'boy', 'Kevin').label, 'Rejected');
  assert.equal(reviewAnswer(room, 'p2', 'boy', 'Andre').valid, true);
});

test('round scoring: unique 100, shared answers split', () => {
  const scores = scoreRoundAnswers(
    K,
    [
      { id: 'a', answers: { boy: 'Kashif', place: 'Kingston', animal: 'Kangaroo' } },
      { id: 'b', answers: { boy: 'kashif ', place: 'Kellits', animal: 'Lion' } },
      { id: 'c', answers: {} },
    ],
    pointsForCount,
  );
  // a: Kashif shared (50) + Kingston (100) + Kangaroo (100)
  // b: Kashif shared (50) + Kellits (100) + Lion wrong letter (0)
  assert.deepEqual(scores, { a: 250, b: 150, c: 0 });
});

test('a rejected answer no longer splits points with the same answer', () => {
  const scores = scoreRoundAnswers(
    { currentLetter: 'K', answerOverrides: { 'b:boy': false } },
    [
      { id: 'a', answers: { boy: 'Kashif' } },
      { id: 'b', answers: { boy: 'Kashif' } },
    ],
    pointsForCount,
  );
  assert.deepEqual(scores, { a: 100, b: 0 });
});
