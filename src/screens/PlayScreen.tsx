import React, { useEffect, useRef, useState } from 'react';
import { useRoundCues } from '../hooks/useDeviceFeedback';
import { requestRoundClose, saveDraftAnswers, submitAnswers } from '../firebase/roomActions';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import { ANSWER_KEYS, CATEGORY_LABELS, answersForRound, roundTiming, serverNow } from '@abc/shared';
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
  roomId: string;
  userId: string;
  players: (PlayerRecord & { id: string })[];
  isDealer: boolean;
  onSubmitted: (answers: Record<string, string>) => void;
  onEndRound: () => Promise<void>;
  onLeaveGame: () => Promise<void>;
  onTogglePause: () => Promise<void>;
}

const EMPTY_ANSWERS: Record<string, string> = {
  boy: '',
  girl: '',
  animal: '',
  place: '',
  food: '',
  thing: '',
};

/** How long to wait after the last keystroke before saving answers to the server. */
const AUTOSAVE_DELAY_MS = 600;

function draftStorageKey(roomId: string, roundNumber: number) {
  return `abc-controller-draft:${roomId}:${roundNumber}`;
}

function normalizeAnswers(source?: Record<string, string>) {
  return { ...EMPTY_ANSWERS, ...(source ?? {}) };
}

function readDraft(roomId: string, roundNumber: number) {
  try {
    const raw = localStorage.getItem(draftStorageKey(roomId, roundNumber));
    if (!raw) return null;
    return normalizeAnswers(JSON.parse(raw) as Record<string, string>);
  } catch {
    return null;
  }
}

function writeDraft(roomId: string, roundNumber: number, answers: Record<string, string>) {
  localStorage.setItem(draftStorageKey(roomId, roundNumber), JSON.stringify(answers));
}

function clearDraft(roomId: string, roundNumber: number) {
  localStorage.removeItem(draftStorageKey(roomId, roundNumber));
}

export default function PlayScreen({
  room,
  roomId,
  userId,
  players,
  isDealer,
  onSubmitted,
  onEndRound,
  onLeaveGame,
  onTogglePause,
}: Props) {
  const myPlayer = players.find(player => player.id === userId);
  const myServerAnswers = myPlayer ? (answersForRound(myPlayer, room.roundNumber) as Record<string, string>) : undefined;
  const hasServerAnswers = !!myServerAnswers && Object.values(myServerAnswers).some(v => v?.trim());
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => normalizeAnswers(readDraft(roomId, room.roundNumber) ?? (hasServerAnswers ? myServerAnswers : undefined) ?? EMPTY_ANSWERS),
  );
  const [timeLeft, setTimeLeft] = useState(room.settings.timer);
  // Tracked in state so the screen re-renders the moment the countdown ends
  // (timeLeft alone doesn't change then), which is when the start buzz fires.
  const [phaseNow, setPhaseNow] = useState(() => roundTiming(room, serverNow()).phase);
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const autosaveRoundRef = useRef<number | null>(null);
  // Latest values for code that runs from timers and could otherwise see an
  // old copy (the clock tick is set up once and lives for the whole round).
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);
  const requestedCloseRef = useRef(false);
  const initializedRoundRef = useRef<string>('');

  const startedAtMs = room.roundStartedAt?.toMillis?.() ?? null;
  const roundCloseRequestedAtMs = room.roundCloseRequestedAt?.toMillis?.() ?? null;
  const timing = roundTiming(room, serverNow());
  const countdownLeft = timing.countdownLeft;
  const isCountdown = timing.phase === 'countdown';
  const stoppedBy = room.letterCall?.stoppedBy;
  const stopLabel = !stoppedBy
    ? 'Get ready'
    : stoppedBy === 'auto'
      ? 'Nobody hit STOP'
      : stoppedBy === userId
        ? 'You hit STOP!'
        : `${players.find(p => p.id === stoppedBy)?.name ?? 'Someone'} hit STOP!`;
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Buzz at round start, 10 seconds left and time up. Skipped once this
  // player has submitted so they aren't nagged while they wait.
  useRoundCues(`${roomId}:${room.roundNumber}`, phaseNow, timeLeft, !myPlayer?.submitted);
  const isPaused = room.status === 'paused';
  const interactionLocked = isCountdown || isPaused || !!myPlayer?.submitted;

  useEffect(() => {
    const roundKey = `${roomId}:${room.roundNumber}`;
    if (initializedRoundRef.current === roundKey) return;

    initializedRoundRef.current = roundKey;
    requestedCloseRef.current = false;
    submittingRef.current = false;
    setSubmitting(false);
    setEnding(false);

    if (autosaveRef.current) {
      window.clearTimeout(autosaveRef.current);
      autosaveRef.current = null;
    }

    setAnswers(normalizeAnswers(readDraft(roomId, room.roundNumber) ?? (hasServerAnswers ? myServerAnswers : undefined) ?? EMPTY_ANSWERS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.roundNumber, roomId]);

  useEffect(() => {
    if (myPlayer?.submitted) {
      submittingRef.current = false;
      clearDraft(roomId, room.roundNumber);
      setAnswers(prev => normalizeAnswers(myPlayer.answers ?? prev));
      setSubmitting(false);
    }
  }, [myPlayer?.submitted, myPlayer?.answers, roomId, room.roundNumber]);

  useEffect(() => {
    if (myPlayer?.submitted) return;

    // When the round changes, this effect runs once more with the previous
    // round's answers still in state. Skip that run; the reset that follows
    // triggers a fresh one with the right answers.
    if (autosaveRoundRef.current !== room.roundNumber) {
      autosaveRoundRef.current = room.roundNumber;
      return;
    }

    writeDraft(roomId, room.roundNumber, answers);

    // Also save to the server, so the referee can score these answers even if
    // this phone locks, loses signal or never presses submit.
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    const round = room.roundNumber;
    const snapshot = normalizeAnswers(answers);
    autosaveRef.current = window.setTimeout(() => {
      autosaveRef.current = null;
      void saveDraftAnswers(roomId, userId, snapshot, round).catch(() => { /* retried on next keystroke or submit */ });
    }, AUTOSAVE_DELAY_MS);
  }, [answers, myPlayer?.submitted, roomId, userId, room.roundNumber]);

  useEffect(() => () => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
  }, []);

  useEffect(() => {
    // The referee (normally the TV) ends the round. This only shows the
    // clock and sends this phone's answers once time is up.
    async function tick() {
      const t = roundTiming(room, serverNow());
      setTimeLeft(t.timeLeft);
      setPhaseNow(t.phase);
      setUrgent(t.phase !== 'countdown' && t.timeLeft <= 10);

      if (t.phase === 'over') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (!myPlayer?.submitted) {
          await handleSubmit(false, false);
        }
      }
    }

    void tick();
    intervalRef.current = setInterval(() => { void tick(); }, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAtMs, room.settings.timer, myPlayer?.submitted, roundCloseRequestedAtMs, roomId, room.status, room.pausedRemainingSec]);

  useEffect(() => {
    if (room.status === 'paused' || !roundCloseRequestedAtMs || myPlayer?.submitted) return;
    void handleSubmit(false, false);
  }, [roundCloseRequestedAtMs, myPlayer?.submitted, room.status]);

  async function handleSubmit(_auto = false, requestClose = false) {
    if (submittingRef.current || myPlayer?.submitted) return;
    submittingRef.current = true;
    setSubmitting(true);
    const submittedAnswers = normalizeAnswers(answersRef.current);
    try {
      if (autosaveRef.current) {
        window.clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
      await submitAnswers(roomId, userId, submittedAnswers, room.roundNumber);
      clearDraft(roomId, room.roundNumber);
      if (requestClose && !requestedCloseRef.current) {
        requestedCloseRef.current = true;
        await requestRoundClose(roomId);
      }
      onSubmitted(submittedAnswers);
    } catch {
      submittingRef.current = false;
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

  async function handleTogglePause() {
    if (togglingPause) return;
    setTogglingPause(true);
    try {
      await onTogglePause();
    } finally {
      setTogglingPause(false);
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
        {(isCountdown || isPaused) && (
          <div className="controller-play-state-banner" aria-live="polite">
            <div className="controller-play-state-card">
              <div className="controller-play-state-kicker">{isPaused ? 'Round paused' : stopLabel}</div>
              <div className="controller-play-state-title">
                {isPaused ? 'Waiting for the dealer to resume play' : `Round starts in ${countdownLeft}`}
              </div>
              <p className="controller-play-state-copy">
                {isPaused
                  ? 'Your answers are safe. The timer is stopped for everyone.'
                  : `The letter is ${room.currentLetter}. Answers unlock when the countdown ends.`}
              </p>
            </div>
          </div>
        )}

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
            {isDealer ? (
              <button
                className="controller-play-control-chip"
                type="button"
                onClick={() => { void handleTogglePause(); }}
                disabled={togglingPause || !!roundCloseRequestedAtMs || isCountdown}
              >
                {togglingPause ? '...' : isPaused ? 'Resume' : 'Pause'}
              </button>
            ) : (
              <div className="controller-play-topbar-spacer" aria-hidden="true" />
            )}
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
                <div className="controller-play-timer-copy">{isPaused ? 'PAUSED' : 'SECS'}</div>
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
              {ANSWER_KEYS.map((key, index) => {
                const value = answers[key] ?? '';
                const isLast = index === ANSWER_KEYS.length - 1;
                return (
                  <label key={key} className={`controller-play-row ${value.trim() ? 'filled' : ''}`}>
                    <span className="controller-play-row-label">{CATEGORY_LABELS[key]}</span>
                    <input
                      ref={el => { inputRefs.current[index] = el; }}
                      className="controller-play-input"
                      value={value}
                      enterKeyHint={isLast ? 'done' : 'next'}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return;
                        // Some Android keyboards send Return while a word suggestion is still open.
                        if (event.nativeEvent.isComposing) return;
                        // Return moves to the next category instead of submitting the form.
                        // On the last one it closes the keyboard; submitting stays a deliberate tap.
                        event.preventDefault();
                        if (isLast) event.currentTarget.blur();
                        else inputRefs.current[index + 1]?.focus();
                      }}
                      onChange={event => setAnswers(prev => ({ ...prev, [key]: event.target.value }))}
                      placeholder={`Starts with ${room.currentLetter}...`}
                      maxLength={40}
                      autoCorrect="off"
                      autoCapitalize="words"
                      spellCheck={false}
                      disabled={interactionLocked}
                    />
                  </label>
                );
              })}
            </div>

            <div className="controller-play-footer">
              <div className="controller-play-footer-copy">
                <PeopleIcon />
                <span>
                  {roundCloseRequestedAtMs ? 'Wrapping up round...' : `${submittedCount}/${players.length} players submitted`}
                </span>
              </div>

              {!myPlayer?.submitted ? (
                <button
                  className="controller-play-submit"
                  type={isDealer ? 'button' : 'submit'}
                  disabled={submitting || isCountdown || isPaused}
                  onClick={isDealer ? () => { void handleSubmit(false, true); } : undefined}
                >
                  {submitting ? 'SUBMITTING ANSWERS' : 'SUBMIT ANSWERS'}
                </button>
              ) : isDealer ? (
                <button
                  className={`controller-play-submit ${allSubmitted ? '' : 'secondary'}`}
                  type="button"
                  onClick={handleEndRound}
                  disabled={ending || isPaused}
                >
                  {ending ? 'ENDING ROUND' : allSubmitted ? 'SCORE ROUND' : 'END ROUND EARLY'}
                </button>
              ) : (
                <div className="controller-play-waiting-note">
                  {isPaused
                    ? 'Round paused. Waiting to resume.'
                    : roundCloseRequestedAtMs
                      ? 'Round closing now. Wrapping up submissions.'
                      : 'Submitted. Waiting for dealer to end the round.'}
                </div>
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
