import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import {
  selectNextLetter,
  normalizeAnswer,
  isValidCategoryAnswer,
  isObviousGarbageAnswer,
  answerReviewKey,
  pointsForCount,
  ANSWER_KEYS,
} from '@abc/shared';
import type { RoomRecord, PlayerRecord, AnswerCategory } from '@abc/shared';

export async function findRoomByCode(code: string): Promise<{ id: string; room: RoomRecord } | null> {
  const q = query(collection(db, 'rooms'), where('code', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, room: docSnap.data() as RoomRecord };
}

export async function joinRoom(roomId: string, userId: string, name: string, avatarId?: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Room not found');

  const playerRef = doc(db, 'rooms', roomId, 'players', userId);
  const existingSnap = await getDoc(playerRef);
  if (existingSnap.exists()) {
    await updateDoc(playerRef, { lastSeenAt: serverTimestamp() });
    return;
  }

  // First player becomes the dealer
  const playersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'));
  const isFirst = playersSnap.empty;

  const batch = writeBatch(db);
  batch.set(playerRef, {
    name,
    avatarId,
    score: 0,
    isDealer: isFirst,
    submitted: false,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
  if (isFirst) {
    batch.update(roomRef, { currentDealerId: userId });
  }
  await batch.commit();
}

export async function updateHeartbeat(roomId: string, userId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'players', userId), {
      lastSeenAt: serverTimestamp(),
    });
  } catch { /* best effort */ }
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'players', userId));
  } catch { /* best effort */ }
}

export async function startGame(
  roomId: string,
  dealerId: string,
  playerIds: string[],
): Promise<void> {
  const firstLetter = selectNextLetter([], 0);
  const batch = writeBatch(db);

  playerIds.forEach(pid => {
    batch.update(doc(db, 'rooms', roomId, 'players', pid), {
      submitted: false,
      answers: { boy: '', girl: '', animal: '', place: '', food: '', thing: '' },
      roundScore: 0,
      scoredRound: 0,
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
    roundStartedAt: serverTimestamp(),
  });

  await batch.commit();
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function isScoreableAnswer(
  room: RoomRecord,
  playerId: string,
  category: AnswerCategory,
  value: string,
): boolean {
  const override = room.answerOverrides?.[answerReviewKey(playerId, category)];
  if (override === true) return true;
  if (override === false) return false;
  if (isObviousGarbageAnswer(value)) return false;
  return isValidCategoryAnswer(category, value, room.currentLetter ?? '');
}

async function scoreRound(
  roomId: string,
  room: RoomRecord,
  players: (PlayerRecord & { id: string })[],
): Promise<void> {
  const targetLetter = (room.currentLetter ?? '').toUpperCase();

  // Count how many players have each normalised answer
  const counts: Record<string, number> = {};
  for (const key of ANSWER_KEYS) {
    for (const p of players) {
      const raw = (p.answers?.[key] ?? '').trim();
      if (!raw || raw[0]?.toUpperCase() !== targetLetter) continue;
      if (!isScoreableAnswer(room, p.id, key, raw)) continue;
      const norm = `${key}:${normalizeAnswer(raw)}`;
      counts[norm] = (counts[norm] ?? 0) + 1;
    }
  }

  const batch = writeBatch(db);
  for (const p of players) {
    let roundScore = 0;
    for (const key of ANSWER_KEYS) {
      const raw = (p.answers?.[key] ?? '').trim();
      if (!raw || raw[0]?.toUpperCase() !== targetLetter) continue;
      if (!isScoreableAnswer(room, p.id, key, raw)) continue;
      const sharedCount = counts[`${key}:${normalizeAnswer(raw)}`] ?? 1;
      roundScore += pointsForCount(sharedCount);
    }
    const prevRoundScore = p.scoredRound === room.roundNumber ? (p.roundScore ?? 0) : 0;
    const totalScore = Math.max(0, (p.score ?? 0) - prevRoundScore + roundScore);
    batch.update(doc(db, 'rooms', roomId, 'players', p.id), {
      score: totalScore,
      roundScore,
      scoredRound: room.roundNumber,
    });
  }

  await batch.commit();
}

export async function endRound(
  roomId: string,
  room: RoomRecord,
  players: (PlayerRecord & { id: string })[],
): Promise<void> {
  await scoreRound(roomId, room, players);
  await updateDoc(doc(db, 'rooms', roomId), { status: 'round_ended', roundCloseRequestedAt: null });
}

export async function requestRoundClose(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), {
    roundCloseRequestedAt: serverTimestamp(),
  });
}

export async function approveAnswer(
  roomId: string,
  room: RoomRecord,
  players: (PlayerRecord & { id: string })[],
  playerId: string,
  category: AnswerCategory,
  approved: boolean,
): Promise<void> {
  const overrides = {
    ...(room.answerOverrides ?? {}),
    [answerReviewKey(playerId, category)]: approved,
  };
  const updatedRoom = { ...room, answerOverrides: overrides };
  await updateDoc(doc(db, 'rooms', roomId), { answerOverrides: overrides });
  await scoreRound(roomId, updatedRoom, players);
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
  const sorted = [...players].sort((a, b) => {
    const aMs = a.joinedAt ? (a.joinedAt as { toMillis: () => number }).toMillis() : 0;
    const bMs = b.joinedAt ? (b.joinedAt as { toMillis: () => number }).toMillis() : 0;
    return aMs - bMs;
  });
  const curIdx = sorted.findIndex(p => p.id === room.currentDealerId);
  const nextDealer = sorted[(curIdx + 1) % sorted.length];

  const history = room.letterHistory ?? [];
  const nextLetter = selectNextLetter(history, nextRound - 1);

  const batch = writeBatch(db);
  players.forEach(p => {
    batch.update(doc(db, 'rooms', roomId, 'players', p.id), {
      submitted: false,
      answers: { boy: '', girl: '', animal: '', place: '', food: '', thing: '' },
      roundScore: 0,
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
    roundStartedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function forceEndGame(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
}

export async function ensureActiveDealer(
  roomId: string,
  room: RoomRecord,
  activePlayers: (PlayerRecord & { id: string })[],
): Promise<void> {
  if (!activePlayers.length) return;
  if (activePlayers.some(player => player.id === room.currentDealerId)) return;

  const sorted = [...activePlayers].sort((a, b) => {
    const aMs = a.joinedAt ? (a.joinedAt as { toMillis: () => number }).toMillis() : 0;
    const bMs = b.joinedAt ? (b.joinedAt as { toMillis: () => number }).toMillis() : 0;
    return aMs - bMs;
  });

  await updateDoc(doc(db, 'rooms', roomId), {
    currentDealerId: sorted[0].id,
  });
}

export async function submitAnswers(
  roomId: string,
  userId: string,
  answers: Record<string, string>,
): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId, 'players', userId), {
    answers,
    submitted: true,
  });
}
