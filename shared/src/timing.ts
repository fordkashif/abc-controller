import type { RoomRecord } from './types';

export type RoundPhase = 'idle' | 'countdown' | 'active' | 'paused' | 'over';

export type RoundTiming = {
  phase: RoundPhase;
  /** Whole seconds until answers unlock (countdown phase only). */
  countdownLeft: number;
  /** Whole seconds left on the round clock. */
  timeLeft: number;
};

type TimingRoom = Pick<RoomRecord, 'status' | 'roundStartedAt' | 'settings' | 'pausedRemainingSec'>;

/** One timer calculation shared by the TV, the phones and the referee. Pass serverNow(). */
export function roundTiming(room: TimingRoom, nowMs: number): RoundTiming {
  const total = room.settings.timer;

  if (room.status === 'paused') {
    const left = Math.min(total, Math.max(0, room.pausedRemainingSec ?? total));
    return { phase: 'paused', countdownLeft: 0, timeLeft: left };
  }
  if (room.status !== 'playing') {
    return { phase: 'idle', countdownLeft: 0, timeLeft: total };
  }

  const startMs = room.roundStartedAt?.toMillis?.();
  if (startMs === undefined) return { phase: 'active', countdownLeft: 0, timeLeft: total };

  if (nowMs < startMs) {
    return { phase: 'countdown', countdownLeft: Math.ceil((startMs - nowMs) / 1000), timeLeft: total };
  }

  const remainingMs = total * 1000 - (nowMs - startMs);
  if (remainingMs <= 0) return { phase: 'over', countdownLeft: 0, timeLeft: 0 };
  return { phase: 'active', countdownLeft: 0, timeLeft: Math.ceil(remainingMs / 1000) };
}
