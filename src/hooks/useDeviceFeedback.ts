import { useEffect, useRef } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (type: 'release', cb: () => void) => void };
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

/**
 * Keeps the phone screen on while `active` is true. Browsers drop the lock
 * whenever the tab is hidden, so it is requested again when the player comes
 * back. Does nothing where the Wake Lock API is missing (older iOS).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!active || !wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const next = await wakeLock!.request('screen');
        if (cancelled) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
        next.addEventListener?.('release', () => {
          sentinel = null;
          // The system can drop the lock while the page is still showing
          // (battery saver, a dialog). Ask again shortly after.
          if (!cancelled && document.visibilityState === 'visible') {
            window.setTimeout(() => { void acquire(); }, 1_000);
          }
        });
      } catch {
        // Denied (low battery, not visible, unsupported). Try again on the next visibility change.
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

export const VIBRATION = {
  roundStart: [60, 50, 120],
  warning: [40, 60, 40],
  timeUp: [250],
} as const;

/** Short buzz. iPhones ignore this (Safari has no Vibration API). */
export function vibrate(pattern: readonly number[]) {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    /* unsupported */
  }
}

/**
 * Buzzes once when the round starts, once at 10 seconds left and once when
 * time is up. Each cue fires once per round, so re-renders don't repeat it.
 */
export function useRoundCues(roundKey: string, phase: string, timeLeft: number, enabled: boolean) {
  const fired = useRef<{ key: string; cues: Set<string> }>({ key: '', cues: new Set() });

  useEffect(() => {
    if (fired.current.key !== roundKey) fired.current = { key: roundKey, cues: new Set() };
    if (!enabled) return;
    const cues = fired.current.cues;

    function once(name: keyof typeof VIBRATION) {
      if (cues.has(name)) return;
      cues.add(name);
      vibrate(VIBRATION[name]);
    }

    if (phase === 'countdown') {
      // A phone that joins mid-round shouldn't buzz for a start it never saw.
      cues.add('pending-start');
      return;
    }
    if (phase === 'active') {
      if (cues.has('pending-start')) once('roundStart');
      if (timeLeft <= 10 && timeLeft > 0) once('warning');
    }
    if (phase === 'over') once('timeUp');
  }, [roundKey, phase, timeLeft, enabled]);
}
