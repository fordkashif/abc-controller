import { useEffect, useRef } from 'react';
import {
  collection,
  doc,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { isClockSynced, serverNow } from './clock';
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
};

/** Runs the room: ends rounds on time, scores them, replaces a missing dealer, ends abandoned games. */
export function useReferee({ db, roomId, room, players, enabled }: RefereeOptions) {
  const latest = useRef({ room, players });
  latest.current = { room, players };
  const busy = useRef(false);
  const shortHandedSince = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !roomId) {
      shortHandedSince.current = null;
      return;
    }

    async function tick() {
      const current = latest.current;
      if (busy.current || !current.room || !roomId) return;
      // A device whose clock is off would end rounds early or think everyone
      // left, so wait until the first clock sync has come back.
      if (!isClockSynced()) return;

      const nowMs = serverNow();
      const activeCount = activePlayersOf(current.players, nowMs).length;
      if (activeCount >= 2 || !['playing', 'paused', 'round_ended'].includes(current.room.status)) {
        shortHandedSince.current = null;
      } else if (shortHandedSince.current === null) {
        shortHandedSince.current = nowMs;
      }

      const action = decideRefereeAction({
        room: current.room,
        players: current.players,
        nowMs,
        shortHandedSinceMs: shortHandedSince.current,
      });
      if (action.type === 'none') return;

      busy.current = true;
      try {
        await runAction(db, roomId, current.room, action);
      } catch (error) {
        console.warn('[referee]', action.type, error);
      } finally {
        busy.current = false;
      }
    }

    const id = window.setInterval(() => { void tick(); }, 500);
    return () => window.clearInterval(id);
  }, [db, roomId, enabled]);
}
