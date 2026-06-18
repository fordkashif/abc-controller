import React from 'react';
import step2Background from '../assets/controller-two-step/step2/optimized/background.webp';
import step2Star from '../assets/controller-two-step/step2/optimized/decor.webp';
import step2Bubble from '../assets/controller-two-step/step2/optimized/decor-2.webp';
import step2GreenSquiggle from '../assets/controller-two-step/step2/optimized/decor-3.webp';
import step2PinkSquiggle from '../assets/controller-two-step/step2/optimized/decor-4.webp';
import step2CyanTile from '../assets/controller-two-step/step2/optimized/decor-5.webp';
import step2PinkTile from '../assets/controller-two-step/step2/optimized/decor-6.webp';
import step2Sparkle from '../assets/controller-two-step/step2/optimized/decor-7.webp';
import step2Logo from '../assets/controller-two-step/step2/optimized/logo.webp';
import personIcon from '../assets/controller-two-step/step2/optimized/person-icon.webp';
import avatarDino from '../assets/controller-two-step/step2/optimized/asset.webp';
import avatarCat from '../assets/controller-two-step/step2/optimized/asset-2.webp';
import avatarPuppy from '../assets/controller-two-step/step2/optimized/asset-3.webp';
import avatarRobot from '../assets/controller-two-step/step2/optimized/asset-4.webp';
import avatarUnicorn from '../assets/controller-two-step/step2/optimized/asset-5.webp';
import avatarStar from '../assets/controller-two-step/step2/optimized/asset-6.webp';

const avatars = [
  { id: 'Dino', src: avatarDino },
  { id: 'Cat', src: avatarCat },
  { id: 'Puppy', src: avatarPuppy },
  { id: 'Robot', src: avatarRobot },
  { id: 'Unicorn', src: avatarUnicorn },
  { id: 'Star', src: avatarStar },
];

type Props = {
  code: string;
  name: string;
  avatar: string;
  error: string;
  loading: boolean;
  onBack: () => void;
  onJoin: () => void;
  onNameChange: (value: string) => void;
  onAvatarChange: (value: string) => void;
};

export default function JoinStepTwo({
  code,
  name,
  avatar,
  error,
  loading,
  onBack,
  onJoin,
  onNameChange,
  onAvatarChange,
}: Props) {
  return (
    <main className="join2-controller join2-step2" style={{ backgroundImage: `url(${step2Background})` }}>
      <DecorSet
        star={step2Star}
        bubble={step2Bubble}
        greenSquiggle={step2GreenSquiggle}
        pinkSquiggle={step2PinkSquiggle}
        cyanTile={step2CyanTile}
        pinkTile={step2PinkTile}
        sparkle={step2Sparkle}
      />

      <section className="join2-content join2-content-step2">
        <div className="join2-topbar">
          <button className="join2-back-button" type="button" aria-label="Back" onClick={onBack}>
            <ChevronLeftIcon />
          </button>
          <span className="join2-room-chip">ROOM {code}</span>
        </div>

        <img className="join2-logo" src={step2Logo} alt="ABC Fast or Slow" />

        <h1 className="join2-headline">Room found!</h1>
        <p className="join2-subhead">Add your name and pick an avatar.</p>

        <form onSubmit={event => { event.preventDefault(); onJoin(); }}>
          <div>
            <label className="join2-label" htmlFor="playerName">Your Name</label>
            <div className="join2-name-field">
              <img className="join2-person-icon" src={personIcon} alt="" aria-hidden="true" />
              <input
                id="playerName"
                className="join2-name-input"
                type="text"
                autoComplete="name"
                maxLength={16}
                placeholder="Enter your name"
                value={name}
                onChange={event => onNameChange(event.target.value)}
              />
            </div>
          </div>

          <section className="join2-avatar-section">
            <h2 className="join2-label">Choose Avatar</h2>
            <div className="join2-avatar-grid">
              {avatars.map(item => (
                <button
                  key={item.id}
                  className={`join2-avatar-card ${avatar === item.id ? 'selected' : ''}`}
                  type="button"
                  aria-label={item.id}
                  onClick={() => onAvatarChange(item.id)}
                >
                  <img src={item.src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
                  <span className="join2-avatar-check"><CheckIcon /></span>
                </button>
              ))}
            </div>
          </section>

          {error && <div className="join-error join2-error">{error}</div>}

          <button className="join2-primary join2-join" type="submit" disabled={loading}>
            {loading ? 'JOINING' : 'JOIN GAME'}
            <ChevronRightIcon />
          </button>

          <p className="join2-footer-note">You are joining ABC Fast or Slow - TV Party Game.</p>
        </form>
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

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M39 16L23 32l16 16" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 33l9 9 19-22" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
