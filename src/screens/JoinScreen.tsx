import React, { Suspense, lazy, useState } from 'react';
import { findRoomByCode, joinRoom } from '../firebase/roomActions';
import type { RoomRecord } from '@abc/shared';
import step1Star from '../assets/controller-two-step/step1/optimized/decor.webp';
import step1Bubble from '../assets/controller-two-step/step1/optimized/decor-2.webp';
import step1GreenSquiggle from '../assets/controller-two-step/step1/optimized/decor-3.webp';
import step1PinkSquiggle from '../assets/controller-two-step/step1/optimized/decor-4.webp';
import step1CyanTile from '../assets/controller-two-step/step1/optimized/decor-5.webp';
import step1PinkTile from '../assets/controller-two-step/step1/optimized/decor-6.webp';
import step1Sparkle from '../assets/controller-two-step/step1/optimized/decor-7.webp';
import step1Logo from '../assets/controller-two-step/step1/optimized/emblem-logo.webp';
import step1RoomIcon from '../assets/controller-two-step/step1/optimized/icon-pill.webp';

interface Props {
  initialCode: string;
  userId: string;
  onJoined: (roomId: string, room: RoomRecord, name: string, avatarId: string) => void;
}

const JoinStepTwo = lazy(() => import('./JoinStepTwo'));

export default function JoinScreen({ initialCode, userId, onJoined }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('Dino');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [roomMatch, setRoomMatch] = useState<{ id: string; room: RoomRecord } | null>(null);

  async function handleContinue() {
    const trimCode = code.trim().toUpperCase();
    if (!trimCode || trimCode.length !== 6) {
      setError('Enter the 6-character room code');
      return;
    }

    setChecking(true);
    setError('');
    try {
      const result = await findRoomByCode(trimCode);
      if (!result) { setError('Room not found - check the code and try again'); return; }
      if (result.room.status === 'finished') { setError('That game has already ended'); return; }
      setRoomMatch(result);
      setStep(2);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setChecking(false);
    }
  }

  async function handleJoin() {
    const trimCode = code.trim().toUpperCase();
    const trimName = name.trim();
    if (!trimName) { setError('Enter your name'); return; }

    setLoading(true);
    setError('');
    try {
      const result = roomMatch ?? await findRoomByCode(trimCode);
      if (!result) { setError('Room not found - check the code and try again'); setStep(1); return; }
      if (result.room.status === 'finished') { setError('That game has already ended'); return; }
      await joinRoom(result.id, userId, trimName, avatar);
      onJoined(result.id, result.room, trimName, avatar);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function updateCode(value: string) {
    setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
    setRoomMatch(null);
    if (error) setError('');
  }

  return (
    <div className="join-page join2-page">
      {(checking || loading) && (
        <div className="join2-loading-overlay" aria-live="polite" aria-busy="true">
          <div className="join2-loading-card">
            <img className="join2-loading-logo" src={step1Logo} alt="ABC Fast or Slow" />
            <div className="join2-loading-copy">
              <h2>{checking ? 'Checking room...' : 'Joining game...'}</h2>
              <p>{checking ? 'Making sure the room code is valid.' : 'Saving your player and getting your controller ready.'}</p>
            </div>
          </div>
        </div>
      )}

      {step === 1 ? (
        <main className="join2-controller join2-step1">
          <DecorSet
            star={step1Star}
            bubble={step1Bubble}
            greenSquiggle={step1GreenSquiggle}
            pinkSquiggle={step1PinkSquiggle}
            cyanTile={step1CyanTile}
            pinkTile={step1PinkTile}
            sparkle={step1Sparkle}
          />

          <section className="join2-content join2-content-step1">
            <div className="join2-emblem-logo-wrap" aria-label="ABC Fast or Slow">
              <img className="join2-emblem-logo" src={step1Logo} alt="" aria-hidden="true" />
            </div>

            <h1 className="join2-headline">Join the game</h1>
            <p className="join2-subhead">Enter the room code shown on the TV.</p>

            <form className="join2-form" onSubmit={e => { e.preventDefault(); void handleContinue(); }}>
              <div>
                <label className="join2-label" htmlFor="roomCode">Room Code</label>
                <div className="join2-room-field">
                  <span className="join2-icon-pill join2-icon-pill-image">
                    <img src={step1RoomIcon} alt="" aria-hidden="true" />
                  </span>
                  <input
                    id="roomCode"
                    className="join2-room-code"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={6}
                    value={code}
                    onChange={e => updateCode(e.target.value)}
                    aria-label="Room code"
                  />
                </div>
                <p className="join2-helper">6 characters from the host screen</p>
              </div>

              {error && <div className="join-error join2-error">{error}</div>}

              <button className="join2-primary" type="submit" disabled={checking}>
                {checking ? 'CHECKING' : 'CONTINUE'}
                <ChevronRightIcon />
              </button>

              <p className="join2-next-note">You will choose your name and avatar next.</p>
              <div className="join2-status-wrap"><span className="join2-status-chip">TV Party Game</span></div>
            </form>
          </section>
        </main>
      ) : (
        <Suspense fallback={<JoinStepTwoLoading code={code} />}>
          <JoinStepTwo
            code={code}
            name={name}
            avatar={avatar}
            error={error}
            loading={loading}
            onBack={() => { setStep(1); setError(''); }}
            onJoin={() => { void handleJoin(); }}
            onNameChange={value => { setName(value); if (error) setError(''); }}
            onAvatarChange={setAvatar}
          />
        </Suspense>
      )}
    </div>
  );
}

function JoinStepTwoLoading({ code }: { code: string }) {
  return (
    <main className="join2-controller join2-step1">
      <DecorSet
        star={step1Star}
        bubble={step1Bubble}
        greenSquiggle={step1GreenSquiggle}
        pinkSquiggle={step1PinkSquiggle}
        cyanTile={step1CyanTile}
        pinkTile={step1PinkTile}
        sparkle={step1Sparkle}
      />

      <section className="join2-content join2-content-step1">
        <div className="join2-emblem-logo-wrap" aria-label="ABC Fast or Slow">
          <img className="join2-emblem-logo" src={step1Logo} alt="" aria-hidden="true" />
        </div>
        <h1 className="join2-headline">Room found!</h1>
        <p className="join2-subhead">Loading name and avatar choices for room {code}.</p>
        <div className="wait-dots" aria-hidden="true">
          <div className="wait-dot" /><div className="wait-dot" /><div className="wait-dot" />
        </div>
      </section>
    </main>
  );
}

function DecorSet({
  star,
  bubble,
  greenSquiggle,
  pinkSquiggle,
  cyanTile,
  pinkTile,
  sparkle,
}: {
  star: string;
  bubble: string;
  greenSquiggle: string;
  pinkSquiggle: string;
  cyanTile: string;
  pinkTile: string;
  sparkle: string;
}) {
  return (
    <>
      <img className="join2-decor join2-star" src={star} alt="" aria-hidden="true" />
      <img className="join2-decor join2-bubble-purple" src={bubble} alt="" aria-hidden="true" />
      <img className="join2-decor join2-squiggle-green" src={greenSquiggle} alt="" aria-hidden="true" />
      <img className="join2-decor join2-squiggle-pink" src={pinkSquiggle} alt="" aria-hidden="true" />
      <img className="join2-decor join2-tile-cyan" src={cyanTile} alt="" aria-hidden="true" />
      <img className="join2-decor join2-tile-pink" src={pinkTile} alt="" aria-hidden="true" />
      <img className="join2-decor join2-sparkle-one" src={sparkle} alt="" aria-hidden="true" />
      <img className="join2-decor join2-sparkle-two" src={sparkle} alt="" aria-hidden="true" />
    </>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M25 16l16 16-16 16" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
