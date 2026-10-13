import type { PlayerRecord, RoomRecord, TimestampLike } from './types';

/** A phone that hasn't checked in for this long is treated as gone. */
export const PLAYER_STALE_MS = 90_000;

/** If the TV hasn't checked in for this long, the dealer's phone takes over refereeing. */
export const HOST_STALE_MS = 25_000;

/** How often the TV checks in. */
export const HOST_HEARTBEAT_MS = 10_000;

function isFresh(ts: TimestampLike | null | undefined, nowMs: number, windowMs: number) {
  if (!ts?.toMillis) return true; // pending server timestamp: just written
  return nowMs - ts.toMillis() <= windowMs;
}

export function isActivePlayer(
  player: Pick<PlayerRecord, 'leftAt' | 'lastSeenAt'> & { id: string },
  nowMs: number,
  selfId?: string | null,
): boolean {
  if (player.leftAt) return false;
  if (selfId && player.id === selfId) return true;
  return isFresh(player.lastSeenAt, nowMs, PLAYER_STALE_MS);
}

export function activePlayersOf<P extends Pick<PlayerRecord, 'leftAt' | 'lastSeenAt'> & { id: string }>(
  players: P[],
  nowMs: number,
  selfId?: string | null,
): P[] {
  return players.filter(player => isActivePlayer(player, nowMs, selfId));
}

/** True while the TV is open and checking in. Rooms from before this change have no hostSeenAt. */
export function isHostActive(room: Pick<RoomRecord, 'hostSeenAt'>, nowMs: number): boolean {
  const seen = room.hostSeenAt?.toMillis?.();
  if (seen === undefined) return false;
  return nowMs - seen <= HOST_STALE_MS;
}

/**
 * The phone that referees while the TV is away: the dealer, or if the dealer
 * has dropped off too, whoever joined first among the players still here.
 */
export function fallbackRefereeId<P extends { id: string; joinedAt?: TimestampLike }>(
  room: Pick<RoomRecord, 'currentDealerId'>,
  activePlayers: P[],
): string | null {
  if (activePlayers.some(p => p.id === room.currentDealerId)) return room.currentDealerId;
  const first = [...activePlayers].sort((a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0))[0];
  return first?.id ?? null;
}
