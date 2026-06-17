import React, { useState } from 'react';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import { ANSWER_KEYS, CATEGORY_LABELS } from '@abc/shared';
import {
  controllerLogo as gameplayLogo,
  controllerDecorMain as bubbleLg,
  controllerDecorBubble as bubbleSm,
  controllerDecorBubble as bubbleRight,
  controllerDecorCyanTile as starOne,
  controllerDecorCyanTile as starTwo,
  controllerDecorSparkle as sparkleOne,
  controllerDecorSparkle as sparkleTwo,
  controllerDecorPinkSquiggle as squigglePink,
  controllerDecorGreenSquiggle as squiggleGreen,
  controllerDecorPinkTile as blobBlue,
  controllerDecorPinkTile as blobPink,
} from '../assets/controllerTheme';

interface Props {
  room: RoomRecord;
  players: (PlayerRecord & { id: string })[];
  userId: string;
  myAnswers: Record<string, string>;
  isDealer: boolean;
  onEndRound: () => Promise<void>;
}

export default function SubmittedScreen({ room, players, myAnswers, isDealer, onEndRound }: Props) {
  const [ending, setEnding] = useState(false);
  const submittedCount = players.filter(player => player.submitted).length;
  const total = players.length;
  const allSubmitted = submittedCount >= total && total > 0;
  const waitingCount = Math.max(0, total - submittedCount);
  const roundClosing = !!room.roundCloseRequestedAt;

  async function handleEndRound() {
    if (ending) return;
    setEnding(true);
    try {
      await onEndRound();
    } catch {
      setEnding(false);
    }
  }

  return (
    <div className="page join2-page">
      <main className="controller-submitted">
        <img className="controller-submitted-decor controller-submitted-bubble-lg" src={bubbleLg} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-bubble-sm" src={bubbleSm} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-bubble-right" src={bubbleRight} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-star-one" src={starOne} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-star-two" src={starTwo} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-sparkle-one" src={sparkleOne} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-sparkle-two" src={sparkleTwo} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-squiggle-pink" src={squigglePink} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-squiggle-green" src={squiggleGreen} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-blob-blue" src={blobBlue} alt="" aria-hidden="true" />
        <img className="controller-submitted-decor controller-submitted-blob-pink" src={blobPink} alt="" aria-hidden="true" />

        <section className="controller-submitted-content">
          <header className="controller-submitted-topbar">
            <button className="controller-submitted-back" type="button" aria-label="Back" disabled>
              <ChevronLeftIcon />
            </button>
            <img className="controller-submitted-logo" src={gameplayLogo} alt="ABC Fast or Slow" />
            <div className="controller-submitted-topbar-spacer" aria-hidden="true" />
          </header>

          <section className="controller-submitted-status">
            <div className="controller-submitted-check">
              <CheckMarkIcon />
            </div>
            <h1 className="controller-submitted-title">Answers in!</h1>
            <div className="controller-submitted-copy-pill">
              <PeopleIcon />
              <span>{allSubmitted ? 'Everyone submitted' : `${submittedCount}/${total} players submitted`}</span>
            </div>
          </section>

          <section className="controller-submitted-card">
            <div className="controller-submitted-card-heading">YOUR ANSWERS</div>
            <div className="controller-submitted-list">
              {ANSWER_KEYS.map(key => {
                const value = myAnswers[key]?.trim() ?? '';
                return (
                  <div key={key} className="controller-submitted-row">
                    <span className="controller-submitted-label">{CATEGORY_LABELS[key] ?? key}</span>
                    <span className={`controller-submitted-value${value ? ' filled' : ' empty'}`}>
                      {value || 'blank'}
                    </span>
                    <span className={`controller-submitted-row-check${value ? ' filled' : ''}`} aria-hidden="true">
                      <MiniCheckIcon />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {isDealer ? (
            <section className="controller-submitted-footer controller-submitted-footer-dealer">
              <div className="controller-submitted-role-pill">
                <CrownIcon />
                <span>You are the dealer</span>
              </div>

              <button
                className="controller-submitted-score-button"
                type="button"
                onClick={handleEndRound}
                disabled={ending}
              >
                <FlagIcon />
                <span>{ending ? 'Scoring...' : allSubmitted ? 'Score Round' : 'End Round Early'}</span>
              </button>

              <p className="controller-submitted-helper">
                {roundClosing
                  ? 'The round is closing now. Any saved answers are being submitted.'
                  : allSubmitted
                    ? 'Everyone is in. You can score the round now.'
                    : `Waiting for ${waitingCount} more player${waitingCount === 1 ? '' : 's'} before auto-score or manual end.`}
              </p>
            </section>
          ) : (
            <section className="controller-submitted-footer controller-submitted-footer-waiting">
              <div className="controller-submitted-wait-card">
                <HourglassIcon />
                <div>
                  <strong>{roundClosing ? 'Round closing now' : 'Waiting for the dealer'}</strong>
                  <span>{roundClosing ? 'Saved answers are being locked in.' : 'to score the round...'}</span>
                </div>
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.5 5 8 11.5 14.5 18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17.5 12a3.25 3.25 0 1 0 0-6.5M3.5 19.5a6.5 6.5 0 0 1 13 0M15 19.5a5.4 5.4 0 0 1 5.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckMarkIcon() {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path d="m34 62 16 16 36-38" stroke="white" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6.5 12.5 3.3 3.3 7.7-8.1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3.5 8.5 4.3 4.2L12 6l4.2 6.7 4.3-4.2-2 10H5.5l-2-10Z" fill="currentColor" />
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      <circle cx="12" cy="4.5" r="1.4" fill="currentColor" />
      <circle cx="18" cy="6" r="1.4" fill="currentColor" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4v16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m7.5 5.5 4 1.8L15.8 5 18 6v9l-2.2-1-4.3 2.2-4-1.8Z" fill="currentColor" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h10M7 21h10M8 3c0 4 4 4.4 4 9s-4 5-4 9M16 3c0 4-4 4.4-4 9s4 5 4 9M9.4 9.3h5.2M9.4 14.7h5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
