import { AUTO_STOP_MS } from './letterCall';
import { activePlayersOf } from './presence';
import { roundTiming } from './timing';
import type { PlayerRecord, RoomRecord } from './types';

/** After the round closes, phones get this long to send their last answers before scoring. */
export const CLOSE_GRACE_MS = 3_000;

/** A game ends if fewer than two players are connected for this long. */
export const SHORT_HANDED_END_MS = 60_000;

export type RefereeAction =
  | { type: 'none' }
  | { type: 'endGame' }
  | { type: 'reassignDealer'; dealerId: string }
  | { type: 'requestClose' }
  | { type: 'finalize' }
  | { type: 'autoStop' };

export type RefereePlayer = PlayerRecord & { id: string };

type DecisionInput = {
  room: RoomRecord;
  players: RefereePlayer[];
  nowMs: number;
  /** Server time when the room first dropped below two active players, or null. */
  shortHandedSinceMs: number | null;
};

const IN_GAME = new Set(['calling', 'playing', 'paused', 'round_ended']);

function joinOrder(a: RefereePlayer, b: RefereePlayer) {
  return (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0);
}

/**
 * Decides the one thing the referee should do next. Pure, so it can be
 * tested and so the TV and the fallback dealer phone always agree.
 */
export function decideRefereeAction({ room, players, nowMs, shortHandedSinceMs }: DecisionInput): RefereeAction {
  const active = activePlayersOf(players, nowMs);

  // In the lobby the dealer starts the game, so someone who is actually here
  // must hold the role. New rooms start with no dealer (or, in rooms created
  // before this fix, the TV's id), so the first player to join gets it.
  if (room.status === 'waiting') {
    if (active.length > 0 && !active.some(p => p.id === room.currentDealerId)) {
      return { type: 'reassignDealer', dealerId: [...active].sort(joinOrder)[0].id };
    }
    return { type: 'none' };
  }

  if (!IN_GAME.has(room.status)) return { type: 'none' };

  if (active.length < 2) {
    if (shortHandedSinceMs !== null && nowMs - shortHandedSinceMs >= SHORT_HANDED_END_MS) {
      return { type: 'endGame' };
    }
  }

  if (active.length > 0 && !active.some(p => p.id === room.currentDealerId)) {
    return { type: 'reassignDealer', dealerId: [...active].sort(joinOrder)[0].id };
  }

  // Nobody hit STOP: stop the alphabet wherever it is so the game keeps moving.
  if (room.status === 'calling') {
    const call = room.letterCall;
    const startMs = call?.startedAt?.toMillis?.();
    if (call?.speed && startMs !== undefined && !call.letter && nowMs - startMs >= AUTO_STOP_MS) {
      return { type: 'autoStop' };
    }
    return { type: 'none' };
  }

  if (room.status !== 'playing' || active.length === 0) return { type: 'none' };

  const timing = roundTiming(room, nowMs);
  if (timing.phase === 'countdown') return { type: 'none' };

  const allSubmitted = active.every(p => p.submitted);
  const closeRequestedAt = room.roundCloseRequestedAt?.toMillis?.();

  if (closeRequestedAt === undefined) {
    if (allSubmitted) return { type: 'finalize' };
    if (timing.phase === 'over') return { type: 'requestClose' };
    return { type: 'none' };
  }

  if (allSubmitted || nowMs - closeRequestedAt >= CLOSE_GRACE_MS) return { type: 'finalize' };
  return { type: 'none' };
}

/** Answers that count for the given round. Answers saved during an earlier round are ignored. */
export function answersForRound(player: Pick<PlayerRecord, 'answers' | 'answersRound'>, roundNumber: number) {
  if (player.answersRound !== undefined && player.answersRound !== roundNumber) return {};
  return player.answers ?? {};
}
