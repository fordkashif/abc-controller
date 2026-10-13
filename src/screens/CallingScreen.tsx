import React, { useEffect, useState } from 'react';
import {
  callTicks,
  chooseCallSpeed,
  isCallRunning,
  serverNow,
  stopLetterCall,
  type CallSpeed,
  type PlayerRecord,
  type RoomRecord,
} from '@abc/shared';
import { db } from '../firebase/config';
import { vibrate } from '../hooks/useDeviceFeedback';
import { controllerLogo } from '../assets/controllerTheme';

interface Props {
  room: RoomRecord;
  roomId: string;
  userId: string;
  players: (PlayerRecord & { id: string })[];
  isDealer: boolean;
}

/**
 * The fast-or-slow call. The dealer picks a speed and the alphabet runs
 * hidden on the TV; everyone else races to hit STOP.
 */
export default function CallingScreen({ room, roomId, userId, players, isDealer }: Props) {
  const call = room.letterCall;
  const [now, setNow] = useState(() => serverNow());
  const [sending, setSending] = useState(false);

  // Fast enough to show the beat at "fast" speed.
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 70);
    return () => window.clearInterval(id);
  }, []);

  // A new round always gets a fresh screen state.
  useEffect(() => { setSending(false); }, [room.roundNumber]);

  const dealerName = players.find(p => p.id === room.currentDealerId)?.name ?? 'The dealer';
  const speed = call?.speed ?? null;
  const running = isCallRunning(call, now);
  const ticks = call ? callTicks(call, now) : 0;
  const speedLabel = speed === 'fast' ? 'FAST' : 'SLOW';

  async function pickSpeed(next: CallSpeed) {
    if (sending) return;
    setSending(true);
    vibrate([30]);
    try {
      await chooseCallSpeed(db, roomId, room.roundNumber, next);
    } catch {
      setSending(false);
    }
  }

  async function hitStop() {
    if (sending || !running) return;
    const tappedAt = serverNow(); // the letter is decided by when you tapped, not when it arrived
    setSending(true);
    vibrate([80]);
    try {
      await stopLetterCall(db, roomId, room.roundNumber, userId, tappedAt);
    } catch {
      setSending(false);
    }
  }

  let body: React.ReactNode;

  if (isDealer && !speed) {
    body = (
      <>
        <h1 className="calling-title">You're the caller</h1>
        <p className="calling-copy">
          Fast or slow? The alphabet runs in secret until someone hits STOP.
        </p>
        <div className="calling-speed-row">
          <button type="button" className="calling-speed-button slow" disabled={sending} onClick={() => { void pickSpeed('slow'); }}>
            SLOW
          </button>
          <button type="button" className="calling-speed-button fast" disabled={sending} onClick={() => { void pickSpeed('fast'); }}>
            FAST
          </button>
        </div>
      </>
    );
  } else if (isDealer) {
    body = (
      <>
        <h1 className="calling-title">Calling {speedLabel}</h1>
        <div className="calling-beat-wrap" aria-hidden="true">
          <div key={running ? ticks : 'wait'} className={`calling-beat ${speed ?? ''}`}>?</div>
        </div>
        <p className="calling-copy">
          {running ? 'The alphabet is running. Wait for someone to hit STOP.' : 'Get ready...'}
        </p>
      </>
    );
  } else if (!speed) {
    body = (
      <>
        <h1 className="calling-title">Get ready to STOP</h1>
        <p className="calling-copy">{dealerName} is choosing fast or slow.</p>
        <button type="button" className="calling-stop-button" disabled>
          STOP
        </button>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="calling-title">{dealerName} called {speedLabel}</h1>
        <p className="calling-copy">
          {running ? 'Hit STOP to pick the letter!' : 'Get ready...'}
        </p>
        <button
          type="button"
          className={`calling-stop-button ${running ? 'live' : ''}`}
          disabled={!running || sending}
          onClick={() => { void hitStop(); }}
        >
          {sending ? '...' : 'STOP'}
        </button>
      </>
    );
  }

  return (
    <div className="page join2-page">
      <main className="controller-play calling-page">
        <section className="controller-play-content calling-content">
          <header className="calling-header">
            <img className="controller-play-logo" src={controllerLogo} alt="ABC Fast or Slow" />
            <div className="controller-play-round-pill">ROUND {room.roundNumber}/{room.settings.rounds}</div>
          </header>
          <div className="calling-body" aria-live="polite">
            {body}
          </div>
        </section>
      </main>
    </div>
  );
}
