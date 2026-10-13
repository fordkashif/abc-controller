import { useEffect, useRef } from 'react';
import {
  collection,
  doc,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { clockSyncStats, getServerOffset, isClockSynced, serverNow } from './clock';
import { chooseCallSpeed, stopLetterCall } from './letterCall';
import { pointsForCount } from './constants';
import { activePlayersOf } from './presence';
import { answersForRound, decideRefereeAction, type RefereeAction, type RefereePlayer } from './refereeDecision';
import { scoreRoundAnswers } from './scoring';
import type { PlayerRecord, RoomRecord } from './types';

export * from './refereeDecision';

/**
 * Scores the round from fresh player documents on the server, never from a
 * device's possibly stale copy, so late answers are not lost.
 *
 * Runs in a transaction that checks the room is still in `expectStatus` on
 * `roundNumber`, so the TV and a fallback phone can both try without
 * double-scoring. With `closeRound`, it also moves the room to round_ended.
 */
export async function scoreRoundOnServer(
  db: Firestore,
  roomId: string,
  roundNumber: number,
  expectStatus: 'playing' | 'round_ended',
  closeRound: boolean,
): Promise<boolean> {
  const roomRef = doc(db, 'rooms', roomId);
  const playersSnap = await getDocsFromServer(collection(db, 'rooms', roomId, 'players'));
  const playerRefs = playersSnap.docs.map(d => d.ref);

  return runTransaction(db, async tx => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) return false;
    const room = roomSnap.data() as RoomRecord;
    if (room.status !== expectStatus || room.roundNumber !== roundNumber) return false;

    const snaps = await Promise.all(playerRefs.map(ref => tx.get(ref)));
    const players = snaps
      .filter(s => s.exists())
      .map(s => ({ id: s.id, ...(s.data() as PlayerRecord) }))
      .filter(p => !p.leftAt);

    const scores = scoreRoundAnswers(
      room,
      players.map(p => ({ id: p.id, answers: answersForRound(p, roundNumber) })),
      pointsForCount,
    );

    for (const p of players) {
      const roundScore = scores[p.id] ?? 0;
      const previous = p.scoredRound === roundNumber ? (p.roundScore ?? 0) : 0;
      tx.update(doc(db, 'rooms', roomId, 'players', p.id), {
        score: Math.max(0, (p.score ?? 0) - previous + roundScore),
        roundScore,
        scoredRound: roundNumber,
      });
    }

    if (closeRound) {
      tx.update(roomRef, { status: 'round_ended', roundCloseRequestedAt: null });
    }
    return true;
  });
}

async function runAction(db: Firestore, roomId: string, room: RoomRecord, action: RefereeAction) {
  const roomRef = doc(db, 'rooms', roomId);

  switch (action.type) {
    case 'finalize':
      await scoreRoundOnServer(db, roomId, room.roundNumber, 'playing', true);
      return;

    case 'requestClose':
      await runTransaction(db, async tx => {
        const snap = await tx.get(roomRef);
        const fresh = snap.data() as RoomRecord | undefined;
        if (!fresh || fresh.status !== 'playing' || fresh.roundNumber !== room.roundNumber) return;
        if (fresh.roundCloseRequestedAt) return;
        tx.update(roomRef, { roundCloseRequestedAt: serverTimestamp() });
      });
      return;

    case 'reassignDealer':
      await runTransaction(db, async tx => {
        // Transactions must do every read before any write.
        const snap = await tx.get(roomRef);
        const fresh = snap.data() as RoomRecord | undefined;
        if (!fresh || fresh.currentDealerId === action.dealerId) return;
        const newRef = doc(db, 'rooms', roomId, 'players', action.dealerId);
        const oldRef = fresh.currentDealerId ? doc(db, 'rooms', roomId, 'players', fresh.currentDealerId) : null;
        const [newSnap, oldSnap] = await Promise.all([tx.get(newRef), oldRef ? tx.get(oldRef) : Promise.resolve(null)]);
        if (!newSnap.exists()) return;

        tx.update(roomRef, { currentDealerId: action.dealerId });
        tx.update(newRef, { isDealer: true });
        if (oldRef && oldSnap?.exists()) tx.update(oldRef, { isDealer: false });
      });
      return;

    case 'endGame':
      await runTransaction(db, async tx => {
        const snap = await tx.get(roomRef);
        const fresh = snap.data() as RoomRecord | undefined;
        if (!fresh || fresh.status === 'finished' || fresh.status === 'waiting') return;
        tx.update(roomRef, { status: 'finished', roundCloseRequestedAt: null });
      });
      return;

    case 'autoSpeed':
      await chooseCallSpeed(db, roomId, room.roundNumber, Math.random() < 0.5 ? 'fast' : 'slow');
      return;

    case 'autoStop':
      await stopLetterCall(db, roomId, room.roundNumber, 'auto', serverNow());
      return;

    case 'none':
      return;
  }
}

type RefereeOptions = {
  db: Firestore;
  roomId: string | null;
  room: RoomRecord | null;
  players: RefereePlayer[];
  /** The TV passes true. A phone passes true only while it is the dealer and the TV has gone quiet. */
  enabled: boolean;
  /**
   * Set when a phone is refereeing. It counts itself as connected, and it only
   * ever gives the dealer role to itself (the rules don't let a player hand the
   * role to someone else; the TV can).
   */
  selfId?: string | null;
};

/** Runs the room: ends rounds on time, scores them, replaces a missing dealer, ends abandoned games. */
/** A referee step that hasn't finished after this long is abandoned, so the referee can't freeze. */
const ACTION_TIMEOUT_MS = 20_000;

/** If the clock never syncs (e.g. the read-back keeps failing), referee on this device's clock after this long. */
const CLOCK_WAIT_MS = 15_000;

/** What the referee saw on its last tick, readable from the console (and by the play test) as window.__abcReferee. */
type RefereeDebug = {
  at: number;
  enabled: boolean;
  synced: boolean;
  offsetMs: number;
  clock: typeof clockSyncStats;
  busy: boolean;
  skipped?: string;
  decision?: string;
  lastAction?: string;
  lastError?: string;
};

function setDebug(update: Partial<RefereeDebug>) {
  const w = globalThis as typeof globalThis & { __abcReferee?: RefereeDebug };
  w.__abcReferee = { ...(w.__abcReferee ?? ({} as RefereeDebug)), ...update, at: Date.now() };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} took longer than ${ms / 1000}s`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function useReferee({ db, roomId, room, players, enabled, selfId }: RefereeOptions) {
  const latest = useRef({ room, players });
  latest.current = { room, players };
  const busy = useRef(false);
  const shortHandedSince = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !roomId) {
      shortHandedSince.current = null;
      setDebug({ enabled: false });
      return;
    }
    const enabledAt = Date.now();

    async function tick() {
      const current = latest.current;
      setDebug({ enabled: true, synced: isClockSynced(), offsetMs: getServerOffset(), clock: { ...clockSyncStats }, busy: busy.current, skipped: undefined });
      if (busy.current || !current.room || !roomId) {
        setDebug({ skipped: busy.current ? 'busy' : 'no room' });
        return;
      }
      // A device whose clock is off would end rounds early or think everyone
      // left, so wait for the first clock sync, but not forever.
      if (!isClockSynced() && Date.now() - enabledAt < CLOCK_WAIT_MS) {
        setDebug({ skipped: 'waiting for clock sync' });
        return;
      }

      const nowMs = serverNow();
      const activeCount = activePlayersOf(current.players, nowMs, selfId).length;
      if (activeCount >= 2 || !['calling', 'playing', 'paused', 'round_ended'].includes(current.room.status)) {
        shortHandedSince.current = null;
      } else if (shortHandedSince.current === null) {
        shortHandedSince.current = nowMs;
      }

      const action = decideRefereeAction({
        room: current.room,
        players: current.players,
        nowMs,
        shortHandedSinceMs: shortHandedSince.current,
        selfId,
      });
      setDebug({ decision: action.type });
      if (action.type === 'none') return;
      if (selfId && action.type === 'reassignDealer' && action.dealerId !== selfId) return;

      busy.current = true;
      setDebug({ lastAction: `${action.type} started` });
      try {
        await withTimeout(runAction(db, roomId, current.room, action), ACTION_TIMEOUT_MS, action.type);
        setDebug({ lastAction: `${action.type} done` });
      } catch (error) {
        console.warn('[referee]', action.type, error);
        setDebug({ lastAction: `${action.type} failed`, lastError: String((error as Error)?.message ?? error).slice(0, 200) });
      } finally {
        busy.current = false;
      }
    }

    const id = window.setInterval(() => { void tick(); }, 500);
    return () => window.clearInterval(id);
  }, [db, roomId, enabled, selfId]);
}
