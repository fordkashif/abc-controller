import React, { useEffect, useRef, useState } from 'react';
import { requestRoundClose, submitAnswers } from '../firebase/roomActions';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import { ANSWER_KEYS, CATEGORY_LABELS } from '@abc/shared';
import gameplayLogo from '../assets/controller-waiting-room/logo.png';
import bubbleLg from '../assets/controller-waiting-room/decor.png';
import bubbleSm from '../assets/controller-waiting-room/decor-2.png';
import bubbleRight from '../assets/controller-waiting-room/decor-3.png';
import starOne from '../assets/controller-waiting-room/decor-4.png';
import starTwo from '../assets/controller-waiting-room/decor-5.png';
import sparkleOne from '../assets/controller-waiting-room/decor-6.png';
import sparkleTwo from '../assets/controller-waiting-room/decor-7.png';
import squigglePink from '../assets/controller-waiting-room/decor-8.png';
import squiggleGreen from '../assets/controller-waiting-room/decor-9.png';
import blobBlue from '../assets/controller-waiting-room/decor-10.png';
import blobPink from '../assets/controller-waiting-room/decor-11.png';

interface Props {
  room: RoomRecord;
  roomId: string;
  userId: string;
  players: (PlayerRecord & { id: string })[];
  isDealer: boolean;
  onSubmitted: (answers: Record<string, string>) => void;
  onEndRound: () => Promise<void>;
  onLeaveGame: () => Promise<void>;
}

export default function PlayScreen({ room, roomId, userId, players, isDealer, onSubmitted, onEndRound, onLeaveGame }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(room.settings.timer);
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoEndRef = useRef<number | null>(null);
  const requestedCloseRef = useRef(false);
  const myPlayer = players.find(player => player.id === userId);

  const startedAtMs = room.roundStartedAt
    ? (room.roundStartedAt as { toMillis: () => number }).toMillis()
    : null;
  const roundCloseRequestedAtMs = room.roundCloseRequestedAt
    ? (room.roundCloseRequestedAt as { toMillis: () => number }).toMillis()
    : null;

  useEffect(() => {
    requestedCloseRef.current = false;
    if (autoEndRef.current) {
      window.clearTimeout(autoEndRef.current);
      autoEndRef.current = null;
    }
  }, [room.roundNumber]);

  useEffect(() => {
    const total = room.settings.timer;

    async function tick() {
      const elapsed = startedAtMs ? (Date.now() - startedAtMs) / 1000 : 0;
      const remaining = Math.max(0, total - elapsed);
      setTimeLeft(Math.ceil(remaining));
      setUrgent(remaining <= 10);
      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (!roundCloseRequestedAtMs && !requestedCloseRef.current) {
          requestedCloseRef.current = true;
          await requestRoundClose(roomId);
        }
        if (!myPlayer?.submitted) {
          await handleSubmit(true, false);
        }
      }
    }

    void tick();
    intervalRef.current = setInterval(() => { void tick(); }, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAtMs, room.settings.timer, myPlayer?.submitted, roundCloseRequestedAtMs, roomId]);

  useEffect(() => {
    if (!roundCloseRequestedAtMs || myPlayer?.submitted) return;
    void handleSubmit(true, false);
  }, [roundCloseRequestedAtMs, myPlayer?.submitted]);

  useEffect(() => {
    if (!isDealer || !roundCloseRequestedAtMs || room.status !== 'playing') return;
    if (autoEndRef.current) window.clearTimeout(autoEndRef.current);
    autoEndRef.current = window.setTimeout(() => {
      void handleEndRound();
    }, 1800);
    return () => {
      if (autoEndRef.current) window.clearTimeout(autoEndRef.current);
    };
  }, [isDealer, roundCloseRequestedAtMs, room.status]);

  async function handleSubmit(auto = false, requestClose = false) {
    if (submitting || myPlayer?.submitted) return;
    setSubmitting(true);
    try {
      await submitAnswers(roomId, userId, answers);
      if (requestClose && !requestedCloseRef.current) {
        requestedCloseRef.current = true;
        await requestRoundClose(roomId);
      }
      onSubmitted(answers);
    } catch {
      setSubmitting(false);
    }
  }

  async function handleEndRound() {
    if (ending) return;
    setEnding(true);
    try {
      await onEndRound();
    } catch {
      setEnding(false);
    }
  }

  async function handleConfirmLeave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await onLeaveGame();
    } catch {
      setLeaving(false);
      setShowLeaveConfirm(false);
    }
  }

  const filledCount = Object.values(answers).filter(value => value.trim()).length;
  const submittedCount = players.filter(player => player.submitted).length;
  const allSubmitted = submittedCount >= players.length && players.length > 0;

  return (
    <div className="page join2-page">
      <main className={`controller-play ${urgent ? 'urgent' : ''}`}>
        {showLeaveConfirm && (
          <div className="controller-play-modal-backdrop" role="presentation">
            <div className="controller-play-modal" role="dialog" aria-modal="true" aria-labelledby="leave-game-title">
              <h2 id="leave-game-title">Leave game?</h2>
              <p>
                You will leave this game on your phone.
                {players.length <= 2 ? ' The game will end and final scores will be shown.' : isDealer ? ' Dealer control will move to another player.' : ''}
              </p>
              <div className="controller-play-modal-actions">
                <button type="button" className="controller-play-modal-button secondary" onClick={() => setShowLeaveConfirm(false)} disabled={leaving}>
                  Stay
                </button>
                <button type="button" className="controller-play-modal-button danger" onClick={() => { void handleConfirmLeave(); }} disabled={leaving}>
                  {leaving ? 'Leaving...' : 'Leave Game'}
                </button>
              </div>
            </div>
          </div>
        )}

        <img className="controller-play-decor controller-play-bubble-lg" src={bubbleLg} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-bubble-sm" src={bubbleSm} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-bubble-right" src={bubbleRight} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-star-one" src={starOne} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-star-two" src={starTwo} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-sparkle-one" src={sparkleOne} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-sparkle-two" src={sparkleTwo} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-squiggle-pink" src={squigglePink} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-squiggle-green" src={squiggleGreen} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-blob-blue" src={blobBlue} alt="" aria-hidden="true" />
        <img className="controller-play-decor controller-play-blob-pink" src={blobPink} alt="" aria-hidden="true" />

        <section className="controller-play-content">
          <header className="controller-play-topbar">
            <button className="controller-play-back" type="button" aria-label="Leave game" onClick={() => setShowLeaveConfirm(true)}>
              <ChevronLeftIcon />
            </button>
            <img className="controller-play-logo" src={gameplayLogo} alt="ABC Fast or Slow" />
            <div className="controller-play-topbar-spacer" aria-hidden="true" />
          </header>

          <section className="controller-play-hero">
            <div className="controller-play-round-pill">ROUND {room.roundNumber}/{room.settings.rounds}</div>

            <div className="controller-play-hero-grid">
              <div className="controller-play-letter-card">
                <div className="controller-play-letter-label">LETTER</div>
                <div className="controller-play-letter">{room.currentLetter}</div>
              </div>

              <div className="controller-play-timer-card">
                <TimerIcon />
                <div className="controller-play-timer-number">{timeLeft}</div>
                <div className="controller-play-timer-copy">SECS</div>
              </div>
            </div>

            <div className="controller-play-rule-pill">
              Answers must start with <strong>{room.currentLetter}</strong>
            </div>

            <div className="controller-play-progress">
              <CheckCircleIcon />
              <span><strong>{filledCount}</strong> of {ANSWER_KEYS.length} filled</span>
            </div>
          </section>

          <form
            className="controller-play-form"
            onSubmit={event => {
              event.preventDefault();
              void handleSubmit(false);
            }}
          >
            <div className="controller-play-answer-list">
              {ANSWER_KEYS.map(key => {
                const value = answers[key] ?? '';
                return (
                  <label key={key} className={`controller-play-row ${value.trim() ? 'filled' : ''}`}>
                    <span className="controller-play-row-label">{CATEGORY_LABELS[key]}</span>
                    <input
                      className="controller-play-input"
                      value={value}
                      onChange={event => setAnswers(prev => ({ ...prev, [key]: event.target.value }))}
                      placeholder={`Starts with ${room.currentLetter}...`}
                      maxLength={40}
                      autoCorrect="off"
                      autoCapitalize="words"
                      spellCheck={false}
                      disabled={myPlayer?.submitted}
                    />
                  </label>
                );
              })}
            </div>

            <div className="controller-play-footer">
              <div className="controller-play-footer-copy">
                <PeopleIcon />
                <span>{submittedCount}/{players.length} players submitted</span>
              </div>

              {!myPlayer?.submitted ? (
                <button
                  className="controller-play-submit"
                  type={isDealer ? 'button' : 'submit'}
                  disabled={submitting}
                  onClick={isDealer ? () => { void handleSubmit(false, true); } : undefined}
                >
                  {submitting ? 'SUBMITTING ANSWERS' : 'SUBMIT ANSWERS'}
                </button>
              ) : isDealer ? (
                <button
                  className={`controller-play-submit ${allSubmitted ? '' : 'secondary'}`}
                  type="button"
                  onClick={handleEndRound}
                  disabled={ending}
                >
                  {ending ? 'ENDING ROUND' : allSubmitted ? 'SCORE ROUND' : 'END ROUND EARLY'}
                </button>
              ) : (
                <div className="controller-play-waiting-note">Submitted. Waiting for dealer to end the round.</div>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M39 16L23 32l16 16" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="24" r="9" fill="currentColor" />
      <circle cx="43" cy="27" r="7" fill="currentColor" opacity=".78" />
      <path d="M10 52c2.8-11 9-16 15-16s12.2 5 15 16" fill="currentColor" />
      <path d="M33 52c1.7-7.5 6-11.2 10.7-11.2 4.7 0 8.5 3.6 10.3 11.2" fill="currentColor" opacity=".78" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="35" r="19" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M32 23v13l8 6" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 10h16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M27 14l-3 5M37 14l3 5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M20 33l8 8 16-18" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
