import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordClockSample, resetServerClock, serverNow } from './clock';
import { isHostActive } from './presence';
import {
  answersForRound,
  CLOSE_GRACE_MS,
  decideRefereeAction,
  SHORT_HANDED_END_MS,
  type RefereePlayer,
} from './refereeDecision';
import { roundTiming } from './timing';
import type { RoomRecord } from './types';

const at = (ms: number) => ({ toMillis: () => ms });
const NOW = 1_000_000;

function room(over: Partial<RoomRecord> = {}): RoomRecord {
  return {
    code: 'ABC123',
    status: 'playing',
    hostId: 'tv',
    currentDealerId: 'a',
    currentLetter: 'K',
    roundNumber: 1,
    settings: { rounds: 3, timer: 60 },
    roundStartedAt: at(NOW - 10_000), // 10s into a 60s round
    ...over,
  };
}

function player(id: string, over: Partial<RefereePlayer> = {}): RefereePlayer {
  return {
    id,
    name: id,
    isDealer: id === 'a',
    score: 0,
    submitted: false,
    joinedAt: at(id.charCodeAt(0)),
    lastSeenAt: at(NOW - 5_000),
    ...over,
  };
}

const decide = (r: RoomRecord, players: RefereePlayer[], shortHandedSinceMs: number | null = null, nowMs = NOW) =>
  decideRefereeAction({ room: r, players, nowMs, shortHandedSinceMs }).type;

test('timer: countdown, active, over, paused', () => {
  const r = room({ roundStartedAt: at(NOW + 2_500) });
  assert.deepEqual(roundTiming(r, NOW), { phase: 'countdown', countdownLeft: 3, timeLeft: 60 });
  assert.deepEqual(roundTiming(room(), NOW), { phase: 'active', countdownLeft: 0, timeLeft: 50 });
  assert.equal(roundTiming(room({ roundStartedAt: at(NOW - 61_000) }), NOW).phase, 'over');
  assert.deepEqual(roundTiming(room({ status: 'paused', pausedRemainingSec: 70 }), NOW), {
    phase: 'paused', countdownLeft: 0, timeLeft: 60,
  });
});

test('round in progress: referee waits', () => {
  assert.equal(decide(room(), [player('a'), player('b')]), 'none');
});

test('time runs out: referee closes the round, then scores after the grace period', () => {
  const players = [player('a'), player('b')];
  const expired = room({ roundStartedAt: at(NOW - 60_000) });
  assert.equal(decide(expired, players), 'requestClose');

  const closing = room({ roundStartedAt: at(NOW - 61_000), roundCloseRequestedAt: at(NOW - 1_000) });
  assert.equal(decide(closing, players), 'none');
  assert.equal(decide(closing, players, null, NOW - 1_000 + CLOSE_GRACE_MS), 'finalize');
});

test('everyone submitted: score right away, no need to wait for the clock', () => {
  const players = [player('a', { submitted: true }), player('b', { submitted: true })];
  assert.equal(decide(room(), players), 'finalize');
});

test('a quiet phone does not hold up the round', () => {
  const players = [
    player('a', { submitted: true }),
    player('b', { submitted: true }),
    player('c', { lastSeenAt: at(NOW - 120_000) }), // gone for 2 minutes
  ];
  assert.equal(decide(room(), players), 'finalize');
});

test('nothing happens during the countdown', () => {
  const players = [player('a', { submitted: true }), player('b', { submitted: true })];
  assert.equal(decide(room({ roundStartedAt: at(NOW + 2_000) }), players), 'none');
});

test('dealer who left is replaced by the earliest joined active player', () => {
  const players = [player('a', { leftAt: at(NOW) }), player('c'), player('b')];
  assert.deepEqual(
    decideRefereeAction({ room: room(), players, nowMs: NOW, shortHandedSinceMs: null }),
    { type: 'reassignDealer', dealerId: 'b' },
  );
});

test('one player short: game only ends after a minute, not instantly', () => {
  const players = [player('a'), player('b', { lastSeenAt: at(NOW - 100_000) })];
  assert.notEqual(decide(room(), players, NOW - 30_000), 'endGame');
  assert.equal(decide(room(), players, NOW - SHORT_HANDED_END_MS), 'endGame');
});

test('lobby and finished rooms are left alone', () => {
  const players = [player('a', { submitted: true })];
  assert.equal(decide(room({ status: 'waiting' }), players, 0), 'none');
  assert.equal(decide(room({ status: 'finished' }), players, 0), 'none');
});

test('answers saved during an earlier round are ignored', () => {
  assert.deepEqual(answersForRound({ answers: { boy: 'Kevin' } as never, answersRound: 1 }, 2), {});
  assert.deepEqual(answersForRound({ answers: { boy: 'Kevin' } as never, answersRound: 2 }, 2), { boy: 'Kevin' });
  assert.deepEqual(answersForRound({ answers: { boy: 'Kevin' } as never }, 2), { boy: 'Kevin' });
});

test('host is active only with a recent heartbeat', () => {
  assert.equal(isHostActive({ hostSeenAt: at(NOW - 5_000) }, NOW), true);
  assert.equal(isHostActive({ hostSeenAt: at(NOW - 60_000) }, NOW), false);
  assert.equal(isHostActive({}, NOW), false);
});

test('clock offset uses the fastest sample', () => {
  resetServerClock();
  // Device clock is 5s behind the server. Slow sample has 2s of noise.
  recordClockSample(1_000, 5_000, 1_000 + 5_000 + 4_000);
  recordClockSample(10_000, 10_100, 10_050 + 5_000);
  const drift = serverNow() - Date.now();
  assert.ok(Math.abs(drift - 5_000) < 5, `offset was ${drift}`);
  resetServerClock();
});

test('fallback referee: dealer while present, otherwise first to join', async () => {
  const { fallbackRefereeId } = await import('./presence');
  const b = player('b');
  const c = player('c');
  assert.equal(fallbackRefereeId({ currentDealerId: 'b' }, [c, b]), 'b');
  assert.equal(fallbackRefereeId({ currentDealerId: 'a' }, [c, b]), 'b');
  assert.equal(fallbackRefereeId({ currentDealerId: 'a' }, []), null);
});

test('clock reports synced only after a sample', async () => {
  const { isClockSynced } = await import('./clock');
  resetServerClock();
  assert.equal(isClockSynced(), false);
  recordClockSample(0, 100, 50);
  assert.equal(isClockSynced(), true);
  resetServerClock();
});

test('lobby: a dealer who is not a player (the TV) is replaced by the first to join', () => {
  const lobby = room({ status: 'waiting', currentDealerId: 'tv', roundNumber: 0 });
  assert.deepEqual(
    decideRefereeAction({ room: lobby, players: [player('c'), player('b')], nowMs: NOW, shortHandedSinceMs: null }),
    { type: 'reassignDealer', dealerId: 'b' },
  );
  assert.equal(decide(room({ status: 'waiting', currentDealerId: '' }), [player('b')]), 'reassignDealer');
  assert.equal(decide(room({ status: 'waiting', currentDealerId: 'b' }), [player('b')]), 'none');
  assert.equal(decide(room({ status: 'waiting', currentDealerId: 'tv' }), []), 'none');
});
