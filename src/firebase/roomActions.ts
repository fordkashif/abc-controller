import {
  collection,
  doc,
  getDocs,
  getDoc,
  getDocsFromServer,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
  deleteField,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import {
  selectNextLetter,
  answerReviewKey,
  roundTiming,
  scoreRoundOnServer,
  serverNow,
  syncServerClock,
  ROUND_COUNTDOWN_MS,
} from '@abc/shared';
import type { RoomRecord, PlayerRecord, AnswerCategory } from '@abc/shared';


export async function findRoomByCode(code: string): Promise<{ id: string; room: RoomRecord } | null> {
  const q = query(collection(db, 'rooms'), where('code', '==', code.toUpperCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, room: docSnap.data() as RoomRecord };
}

export async function joinRoom(roomId: string, userId: string, name: string, avatarId?: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', userId);

  await runTransaction(db, async tx => {
    const [roomSnap, existingSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playerRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Room not found');
    }

    const room = roomSnap.data() as RoomRecord;
    const shouldBeLobby = room.status === 'waiting';

    if (existingSnap.exists()) {
      tx.update(playerRef, {
        name,
        avatarId,
        lastSeenAt: serverTimestamp(),
        leftAt: deleteField(),
        connectionState: shouldBeLobby ? 'lobby' : 'playing',
      });
      return;
    }

    if (!shouldBeLobby) {
      throw new Error('This game is already in progress');
    }

    const isFirstPlayer = !room.currentDealerId;

    tx.set(playerRef, {
      name,
      avatarId,
      score: 0,
      isDealer: isFirstPlayer,
      submitted: false,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      connectionState: 'lobby',
      ready: true,
    });

    if (isFirstPlayer) {
      tx.update(roomRef, { currentDealerId: userId });
    }
  });
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'players', userId));
  } catch { /* best effort */ }
}

export async function leaveActiveGame(roomId: string, userId: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', userId);

  await runTransaction(db, async tx => {
    const [roomSnap, playerSnap, playersSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playerRef),
      getDocs(collection(db, 'rooms', roomId, 'players')),
    ]);

    if (!roomSnap.exists() || !playerSnap.exists()) return;

    const room = roomSnap.data() as RoomRecord;
    const players = playersSnap.docs.map(playerDoc => ({
      id: playerDoc.id,
      ...(playerDoc.data() as PlayerRecord),
    }));

    const remaining = players.filter(player => player.id !== userId && !player.leftAt);
    const nextDealer =
      remaining.length > 0
        ? remaining[Math.floor(Math.random() * remaining.length)]
        : null;

    tx.update(playerRef, {
      leftAt: serverTimestamp(),
      connectionState: 'left',
      lastSeenAt: serverTimestamp(),
      isDealer: false,
    });

    if (room.status === 'playing' || room.status === 'round_ended') {
      if (remaining.length <= 1) {
        tx.update(roomRef, {
          status: 'finished',
          currentDealerId: nextDealer?.id ?? '',
        });
      } else if (room.currentDealerId === userId && nextDealer) {
        tx.update(roomRef, { currentDealerId: nextDealer.id });
        tx.update(doc(db, 'rooms', roomId, 'players', nextDealer.id), { isDealer: true });
      }
    } else if (room.currentDealerId === userId && nextDealer) {
      tx.update(roomRef, { currentDealerId: nextDealer.id });
      tx.update(doc(db, 'rooms', roomId, 'players', nextDealer.id), { isDealer: true });
    }
  });
}

export async function startGame(
  roomId: string,
  dealerId: string,
  playerIds: string[],
): Promise<void> {
  const firstLetter = selectNextLetter([], 0);
  const countdownStart = Timestamp.fromMillis(serverNow() + ROUND_COUNTDOWN_MS);
  const batch = writeBatch(db);

  playerIds.forEach(pid => {
    batch.update(doc(db, 'rooms', roomId, 'players', pid), {
      submitted: false,
      answers: { boy: '', girl: '', animal: '', place: '', food: '', thing: '' },
      answersRound: 1,
      roundScore: 0,
      scoredRound: 0,
      ready: true,
      connectionState: 'playing',
    });
  });

  batch.update(doc(db, 'rooms', roomId), {
    status: 'playing',
    currentDealerId: dealerId,
    currentLetter: firstLetter,
    letterHistory: [firstLetter],
    answerOverrides: {},
    roundCloseRequestedAt: null,
    roundNumber: 1,
    roundStartedAt: countdownStart,
    pausedRemainingSec: null,
  });

  await batch.commit();
}

// ── Round control ─────────────────────────────────────────────────────────────
// Ending rounds on time, scoring, replacing a missing dealer and ending
// abandoned games are handled by the referee in shared/src/referee.ts, which
// runs on the TV (or on the dealer's phone if the TV goes quiet).

/** Asks the referee to close the round. Phones send their answers when they see this. */
export async function requestRoundClose(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), {
    roundCloseRequestedAt: serverTimestamp(),
  });
}

export async function approveAnswer(
  roomId: string,
  room: RoomRecord,
  playerId: string,
  category: AnswerCategory,
  approved: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), {
    [`answerOverrides.${answerReviewKey(playerId, category)}`]: approved,
  });
  await scoreRoundOnServer(db, roomId, room.roundNumber, 'round_ended', false);
}

export async function advanceRound(
  roomId: string,
  room: RoomRecord,
  players: (PlayerRecord & { id: string })[],
): Promise<void> {
  const nextRound = room.roundNumber + 1;

  if (nextRound > room.settings.rounds) {
    await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
    return;
  }

  // Rotate dealer to next player in join order
  const sorted = [...players].sort((a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0));
  const curIdx = sorted.findIndex(p => p.id === room.currentDealerId);
  const nextDealer = sorted[(curIdx + 1) % sorted.length];

  const history = room.letterHistory ?? [];
  const nextLetter = selectNextLetter(history, nextRound - 1);
  const countdownStart = Timestamp.fromMillis(serverNow() + ROUND_COUNTDOWN_MS);

  // Reset everyone still in the room, including phones that dropped off, so a
  // player who reconnects isn't stuck on last round's "submitted" screen.
  const everyone = await getDocsFromServer(collection(db, 'rooms', roomId, 'players'));
  const toReset = everyone.docs.filter(d => !(d.data() as PlayerRecord).leftAt);

  const batch = writeBatch(db);
  toReset.forEach(p => {
    batch.update(doc(db, 'rooms', roomId, 'players', p.id), {
      submitted: false,
      answers: { boy: '', girl: '', animal: '', place: '', food: '', thing: '' },
      answersRound: nextRound,
      roundScore: 0,
      connectionState: 'playing',
      isDealer: p.id === nextDealer.id,
    });
  });
  batch.update(doc(db, 'rooms', roomId), {
    status: 'playing',
    currentDealerId: nextDealer.id,
    roundNumber: nextRound,
    currentLetter: nextLetter,
    letterHistory: [...history, nextLetter],
    answerOverrides: {},
    roundCloseRequestedAt: null,
    roundStartedAt: countdownStart,
    pausedRemainingSec: null,
  });

  await batch.commit();
}

export async function pauseRound(roomId: string, room: RoomRecord): Promise<void> {
  if (room.status !== 'playing') return;

  const timing = roundTiming(room, serverNow());
  // Pausing during the countdown would skip it on resume, so only pause a running clock.
  if (timing.phase !== 'active') return;

  await updateDoc(doc(db, 'rooms', roomId), {
    status: 'paused',
    pausedRemainingSec: timing.timeLeft,
  });
}

export async function resumeRound(roomId: string, room: RoomRecord): Promise<void> {
  if (room.status !== 'paused') return;

  const total = room.settings.timer;
  const remainingSeconds = Math.min(total, Math.max(0, room.pausedRemainingSec ?? total));
  const resumedStart = Timestamp.fromMillis(serverNow() - (total - remainingSeconds) * 1000);

  await updateDoc(doc(db, 'rooms', roomId), {
    status: 'playing',
    roundStartedAt: resumedStart,
    pausedRemainingSec: null,
  });
}

/** Final answers. Marks the player as done for this round. */
export async function submitAnswers(
  roomId: string,
  userId: string,
  answers: Record<string, string>,
  roundNumber: number,
): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId, 'players', userId), {
    answers,
    answersRound: roundNumber,
    submitted: true,
  });
}

/** Saves answers as the player types, so nothing is lost if their phone sleeps or drops off. */
export async function saveDraftAnswers(
  roomId: string,
  userId: string,
  answers: Record<string, string>,
  roundNumber: number,
): Promise<void> {
  // Only while the round is still open, so a save that was in flight when the
  // round got scored can't change answers after the fact.
  const roomRef = doc(db, 'rooms', roomId);
  const playerRef = doc(db, 'rooms', roomId, 'players', userId);
  await runTransaction(db, async tx => {
    const [roomSnap, playerSnap] = await Promise.all([tx.get(roomRef), tx.get(playerRef)]);
    const room = roomSnap.data() as RoomRecord | undefined;
    if (!room || room.roundNumber !== roundNumber) return;
    if (room.status !== 'playing' && room.status !== 'paused') return;
    if ((playerSnap.data() as PlayerRecord | undefined)?.submitted) return;
    tx.update(playerRef, { answers, answersRound: roundNumber });
  });
}

/** Heartbeat that also keeps this phone's clock in step with the server. */
export async function updateHeartbeat(roomId: string, userId: string): Promise<void> {
  try {
    await syncServerClock(doc(db, 'rooms', roomId, 'players', userId), 'lastSeenAt');
  } catch { /* best effort */ }
}
