import { doc, runTransaction, Timestamp, type Firestore } from 'firebase/firestore';
import { serverNow } from './clock';
import { ROUND_COUNTDOWN_MS } from './constants';
import type { RoomRecord, TimestampLike } from './types';

/**
 * "ABC fast or slow": the dealer picks a speed, the alphabet runs silently at
 * that speed (nobody sees the letters), and the first player to hit STOP
 * lands on the letter for the round.
 */

export type CallSpeed = 'fast' | 'slow';

export type LetterCall = {
  speed: CallSpeed | null;
  /** Server time the hidden alphabet starts running. */
  startedAt: TimestampLike | null;
  /** Player id that hit STOP, or 'auto' if nobody did in time. */
  stoppedBy: string | null;
  letter: string | null;
};

export const EMPTY_LETTER_CALL: LetterCall = { speed: null, startedAt: null, stoppedBy: null, letter: null };

/** How long each letter lasts. Slow stays near the start of the alphabet for a while; fast races through it. */
export const CALL_TICK_MS: Record<CallSpeed, number> = { fast: 140, slow: 650 };

/** Short beat after the dealer picks a speed, so everyone sees it start. */
export const CALL_LEAD_MS = 1_500;

/** If nobody hits STOP this long after the alphabet starts, the referee stops it. */
export const AUTO_STOP_MS = 20_000;

/** Time between STOP and answers unlocking: the reveal plus the usual countdown. */
export const REVEAL_MS = 1_500 + ROUND_COUNTDOWN_MS;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Letters the alphabet runs through: everything not used yet this game (all 26 once they're used up). */
export function callableLetters(history: string[] = []): string[] {
  const used = new Set(history.map(letter => letter.toUpperCase()));
  const left = ALPHABET.filter(letter => !used.has(letter));
  return left.length > 0 ? left : ALPHABET;
}

/** How many letters the hidden alphabet has stepped through by `atMs`. Drives the pulse on the TV. */
export function callTicks(call: Pick<LetterCall, 'speed' | 'startedAt'>, atMs: number): number {
  const startMs = call.startedAt?.toMillis?.();
  if (!call.speed || startMs === undefined || atMs < startMs) return 0;
  return Math.floor((atMs - startMs) / CALL_TICK_MS[call.speed]);
}

/** The letter the hidden alphabet is on at `atMs`. */
export function letterAt(call: Pick<LetterCall, 'speed' | 'startedAt'>, history: string[] | undefined, atMs: number): string {
  const letters = callableLetters(history);
  return letters[callTicks(call, atMs) % letters.length];
}

/** True once the dealer has picked a speed and the lead-in beat is over. */
export function isCallRunning(call: LetterCall | undefined, nowMs: number): boolean {
  const startMs = call?.startedAt?.toMillis?.();
  return !!call?.speed && startMs !== undefined && nowMs >= startMs && !call.letter;
}

/** Dealer picks fast or slow. Ignored if a speed was already picked for this round. */
export async function chooseCallSpeed(db: Firestore, roomId: string, roundNumber: number, speed: CallSpeed): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(roomRef);
    const room = snap.data() as RoomRecord | undefined;
    if (!room || room.status !== 'calling' || room.roundNumber !== roundNumber) return;
    if (room.letterCall?.speed) return;
    tx.update(roomRef, {
      letterCall: {
        ...EMPTY_LETTER_CALL,
        speed,
        startedAt: Timestamp.fromMillis(serverNow() + CALL_LEAD_MS),
      },
    });
  });
}

/**
 * Stops the alphabet at `atMs` (the moment STOP was tapped, on server time)
 * and starts the round with that letter. The first STOP wins; later ones do
 * nothing. Returns the letter, or null if someone else got there first.
 */
export async function stopLetterCall(
  db: Firestore,
  roomId: string,
  roundNumber: number,
  stoppedBy: string,
  atMs: number,
): Promise<string | null> {
  const roomRef = doc(db, 'rooms', roomId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(roomRef);
    const room = snap.data() as RoomRecord | undefined;
    if (!room || room.status !== 'calling' || room.roundNumber !== roundNumber) return null;
    const call = room.letterCall;
    if (!call?.speed || !call.startedAt || call.letter) return null;

    const letter = letterAt(call, room.letterHistory, Math.max(atMs, call.startedAt.toMillis()));
    tx.update(roomRef, {
      status: 'playing',
      letterCall: { ...call, stoppedBy, letter },
      currentLetter: letter,
      letterHistory: [...(room.letterHistory ?? []), letter],
      roundStartedAt: Timestamp.fromMillis(serverNow() + REVEAL_MS),
      answerOverrides: {},
      roundCloseRequestedAt: null,
      pausedRemainingSec: null,
    });
    return letter;
  });
}
