import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_STOP_MS,
  CALL_TICK_MS,
  callableLetters,
  callTicks,
  EMPTY_LETTER_CALL,
  isCallRunning,
  letterAt,
  type LetterCall,
} from './letterCall';
import { decideRefereeAction, type RefereePlayer } from './refereeDecision';
import type { RoomRecord } from './types';

const at = (ms: number) => ({ toMillis: () => ms });
const START = 1_000_000;
const slow: LetterCall = { ...EMPTY_LETTER_CALL, speed: 'slow', startedAt: at(START) };
const fast: LetterCall = { ...EMPTY_LETTER_CALL, speed: 'fast', startedAt: at(START) };

test('alphabet starts at A and steps once per tick', () => {
  assert.equal(letterAt(slow, [], START), 'A');
  assert.equal(letterAt(slow, [], START + CALL_TICK_MS.slow - 1), 'A');
  assert.equal(letterAt(slow, [], START + CALL_TICK_MS.slow), 'B');
  assert.equal(letterAt(fast, [], START + CALL_TICK_MS.fast * 25), 'Z');
  assert.equal(letterAt(fast, [], START + CALL_TICK_MS.fast * 26), 'A'); // wraps around
});

test('slow stays near the start of the alphabet longer than fast', () => {
  const twoSeconds = START + 2_000;
  assert.equal(letterAt(slow, [], twoSeconds), 'D');
  assert.equal(letterAt(fast, [], twoSeconds), 'O');
});

test('letters already used this game are skipped', () => {
  assert.deepEqual(callableLetters(['A', 'c']).slice(0, 3), ['B', 'D', 'E']);
  assert.equal(letterAt(slow, ['A'], START), 'B');
  assert.equal(callableLetters('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).length, 26); // all used: start over
});

test('a STOP before the alphabet starts lands on the first letter', () => {
  assert.equal(callTicks(slow, START - 500), 0);
  assert.equal(letterAt(slow, [], START - 500), 'A');
});

test('call is running only after the speed is picked and the lead-in is over', () => {
  assert.equal(isCallRunning(EMPTY_LETTER_CALL, START), false);
  assert.equal(isCallRunning(slow, START - 1), false);
  assert.equal(isCallRunning(slow, START), true);
  assert.equal(isCallRunning({ ...slow, letter: 'B' }, START + 5_000), false);
});

function calling(call: LetterCall): RoomRecord {
  return {
    code: 'ABC123', status: 'calling', hostId: 'tv', currentDealerId: 'a', currentLetter: '',
    roundNumber: 1, settings: { rounds: 3, timer: 60 }, letterCall: call,
  };
}
const players: RefereePlayer[] = ['a', 'b'].map(id => ({
  id, name: id, isDealer: id === 'a', score: 0, submitted: false, joinedAt: at(id.charCodeAt(0)), lastSeenAt: at(START),
}));
const decide = (r: RoomRecord, nowMs: number) =>
  decideRefereeAction({ room: r, players, nowMs, shortHandedSinceMs: null }).type;

test('referee waits for the dealer to pick a speed and for someone to hit STOP', () => {
  assert.equal(decide(calling(EMPTY_LETTER_CALL), START + 60_000), 'none');
  assert.equal(decide(calling(slow), START + 5_000), 'none');
});

test('referee stops the alphabet if nobody does', () => {
  assert.equal(decide(calling(slow), START + AUTO_STOP_MS), 'autoStop');
  assert.equal(decide(calling({ ...slow, letter: 'C' }), START + AUTO_STOP_MS), 'none');
});

test('a missing dealer is replaced while calling', () => {
  const room = { ...calling(EMPTY_LETTER_CALL), currentDealerId: 'gone' };
  assert.equal(decide(room, START), 'reassignDealer');
});

test('referee picks a speed if the dealer never does', async () => {
  const { AUTO_SPEED_MS } = await import('./letterCall');
  const waiting = calling({ ...EMPTY_LETTER_CALL, callingSince: at(START) });
  assert.equal(decide(waiting, START + AUTO_SPEED_MS - 1), 'none');
  assert.equal(decide(waiting, START + AUTO_SPEED_MS), 'autoSpeed');
  // Rooms from before callingSince existed are left to the dealer.
  assert.equal(decide(calling(EMPTY_LETTER_CALL), START + 10 * AUTO_SPEED_MS), 'none');
});

test('a refereeing phone counts itself as connected', () => {
  const stale = players.map(p => (p.id === 'a' ? { ...p, lastSeenAt: at(START - 200_000) } : p));
  const room = calling(EMPTY_LETTER_CALL);
  // Seen from elsewhere, the dealer looks gone...
  assert.equal(decideRefereeAction({ room, players: stale, nowMs: START, shortHandedSinceMs: null }).type, 'reassignDealer');
  // ...but the dealer's own phone knows it is here.
  assert.equal(decideRefereeAction({ room, players: stale, nowMs: START, shortHandedSinceMs: null, selfId: 'a' }).type, 'none');
});
