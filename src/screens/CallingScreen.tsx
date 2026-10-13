import React, { useEffect, useState } from 'react';
import {
  callTicks,
  chooseCallSpeed,
  isCallRunning,
  isClockSynced,
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
  onLeaveGame: () => Promise<void>;
}

/**
 * The fast-or-slow call. The dealer picks a speed and the alphabet runs
 * hidden on the TV; everyone else races to hit STOP.
 */
export default function CallingScreen({ room, roomId, userId, players, isDealer, onLeaveGame }: Props) {
  const call = room.letterCall;
  const [now, setNow] = useState(() => serverNow());
  const [sending, setSending] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
  // Speed and STOP times come from this phone's view of the server clock, so
  // wait for the first sync (it happens within a second of joining).
  const clockReady = isClockSynced();

  async function pickSpeed(next: CallSpeed) {
    if (sending || !clockReady) return;
    setSending(true);
    vibrate([30]);
    try {
      await chooseCallSpeed(db, roomId, room.roundNumber, next);
    } catch {
      setSending(false);
    }
  }

  async function hitStop() {
    if (sending || !running || !clockReady) return;
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
          <button type="button" className="calling-speed-button slow" disabled={sending || !clockReady} onClick={() => { void pickSpeed('slow'); }}>
            SLOW
          </button>
          <button type="button" className="calling-speed-button fast" disabled={sending || !clockReady} onClick={() => { void pickSpeed('fast'); }}>
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
          disabled={!running || sending || !clockReady}
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
        {showLeaveConfirm && (
          <div className="controller-play-modal-backdrop" role="presentation">
            <div className="controller-play-modal" role="dialog" aria-modal="true" aria-labelledby="leave-calling-title">
              <h2 id="leave-calling-title">Leave game?</h2>
              <p>
                You will leave this game on your phone.
                {players.length <= 2 ? ' The game will end and final scores will be shown.' : isDealer ? ' Dealer control will move to another player.' : ''}
              </p>
              <div className="controller-play-modal-actions">
                <button type="button" className="controller-play-modal-button secondary" onClick={() => setShowLeaveConfirm(false)} disabled={leaving}>
                  Stay
                </button>
                <button
                  type="button"
                  className="controller-play-modal-button danger"
                  disabled={leaving}
                  onClick={() => {
                    setLeaving(true);
                    onLeaveGame().catch(() => { setLeaving(false); setShowLeaveConfirm(false); });
                  }}
                >
                  {leaving ? 'Leaving...' : 'Leave Game'}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="controller-play-content calling-content">
          <button className="controller-play-back calling-back" type="button" aria-label="Leave game" onClick={() => setShowLeaveConfirm(true)}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M39 16L23 32l16 16" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
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
