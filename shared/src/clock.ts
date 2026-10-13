import { getDocFromServer, serverTimestamp, updateDoc, type DocumentReference } from 'firebase/firestore';

/**
 * Every device measures how far its clock is from Firestore's, so timers,
 * countdowns and "is this player still here" checks all run on server time.
 * Without this, a phone whose clock is a few seconds fast ends the round
 * early for everyone.
 */

let offsetMs = 0;
let samples: { offset: number; rtt: number }[] = [];

/** For diagnostics: how clock syncs have gone on this device. */
export const clockSyncStats = { attempts: 0, slowSkips: 0, lastError: '' as string, lastRttMs: 0 };

/** Current time on the server's clock, as best this device knows it. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** False until this device has measured its clock at least once. */
export function isClockSynced(): boolean {
  return samples.length > 0;
}

export function getServerOffset(): number {
  return offsetMs;
}

/**
 * Records one measurement. Keeps the last few and uses the one with the
 * shortest round trip, since that one has the least uncertainty.
 */
export function recordClockSample(localBeforeMs: number, localAfterMs: number, serverMs: number): number {
  const rtt = Math.max(0, localAfterMs - localBeforeMs);
  const offset = serverMs - (localBeforeMs + localAfterMs) / 2;
  samples = [...samples, { offset, rtt }].slice(-5);
  offsetMs = samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
  return offsetMs;
}

/** Test helper. */
export function resetServerClock(): void {
  offsetMs = 0;
  samples = [];
}

/**
 * Writes a server timestamp to `field` on `ref` and reads it back to measure
 * this device's clock offset. Doubles as a heartbeat, so callers use their
 * existing presence field (lastSeenAt for phones, hostSeenAt for the TV).
 */
export async function syncServerClock(ref: DocumentReference, field: string): Promise<void> {
  clockSyncStats.attempts += 1;
  try {
    const before = Date.now();
    await updateDoc(ref, { [field]: serverTimestamp() });
    const after = Date.now();
    clockSyncStats.lastRttMs = after - before;
    // Skip the sample if the network was slow; it would only add noise.
    // The first sample is always kept, so a slow connection still gets synced.
    if (after - before > 4_000 && samples.length > 0) {
      clockSyncStats.slowSkips += 1;
      return;
    }
    const snap = await getDocFromServer(ref);
    const value = snap.get(field) as { toMillis?: () => number } | undefined;
    if (value?.toMillis) recordClockSample(before, after, value.toMillis());
    else clockSyncStats.lastError = `no ${field} timestamp on read-back`;
  } catch (error) {
    clockSyncStats.lastError = String((error as Error)?.message ?? error).slice(0, 160);
    throw error;
  }
}
